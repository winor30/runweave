// src/agents/codex.ts
import { Codex } from "@openai/codex-sdk";
import type {
  ModelReasoningEffort,
  ThreadOptions,
  ApprovalMode,
  SandboxMode,
} from "@openai/codex-sdk";
import type { AgentBackend, AgentSession, AgentEvent, StartSessionOptions } from "./types.js";
import { CODEX_VALID_EFFORTS } from "../shared/types.js";
import type { AgentEffortLevel, AgentMode } from "../shared/types.js";

interface CodexModeConfig {
  approvalPolicy: ApprovalMode;
  sandboxMode: SandboxMode;
}

// Maps runweave AgentMode to Codex SDK approval + sandbox settings.
// autonomous: never-ask + workspace-write — agent works freely within the project.
// full-auto: never-ask + danger-full-access — agent can perform any system operation.
// supervised: on-request — agent pauses and surfaces tool calls for human review.
// readonly: on-request + read-only sandbox — agent can only read, never write.
function mapModeToCodexConfig(mode: AgentMode): CodexModeConfig {
  switch (mode) {
    case "autonomous":
      return { approvalPolicy: "never", sandboxMode: "workspace-write" };
    case "full-auto":
      return { approvalPolicy: "never", sandboxMode: "danger-full-access" };
    case "supervised":
      return { approvalPolicy: "on-request", sandboxMode: "workspace-write" };
    case "readonly":
      return { approvalPolicy: "on-request", sandboxMode: "read-only" };
  }
}

// Validates and casts effort to the Codex-supported subset (ModelReasoningEffort).
// Schema validation normally rejects unsupported values before this point;
// the throw here guards against bypassed validation.
const CODEX_EFFORT_SET = new Set<string>(CODEX_VALID_EFFORTS);

function mapEffortToCodex(effort: AgentEffortLevel): ModelReasoningEffort {
  if (!CODEX_EFFORT_SET.has(effort)) {
    throw new Error(`effort '${effort}' is not supported by codex backend`);
  }
  return effort as ModelReasoningEffort;
}

export class CodexBackend implements AgentBackend {
  readonly provider = "codex" as const;

  async startSession(opts: StartSessionOptions): Promise<AgentSession> {
    const codex = new Codex();
    const config = mapModeToCodexConfig(opts.mode);

    const threadOptions: ThreadOptions = {
      approvalPolicy: config.approvalPolicy,
      sandboxMode: config.sandboxMode,
      ...(opts.model !== undefined ? { model: opts.model } : {}),
      ...(opts.effort !== undefined ? { modelReasoningEffort: mapEffortToCodex(opts.effort) } : {}),
    };

    const thread = codex.startThread(threadOptions);
    const result = await thread.run(opts.prompt);

    // thread.id is set after the first run() call returns
    const threadId = thread.id ?? "";

    return {
      id: threadId,
      status: "completed",
      events: makeCompletedEvents(result),
    };
  }

  async resumeSession(sessionId: string, prompt: string): Promise<AgentSession> {
    const codex = new Codex();

    // Resume using the thread's stored ID; no specific mode options are needed
    // because the persisted thread already has its sandbox/approval policy set.
    const thread = codex.resumeThread(sessionId, {});
    const result = await thread.run(prompt);

    return {
      id: sessionId,
      status: "completed",
      events: makeCompletedEvents(result),
    };
  }

  // stopSession is a no-op: Codex threads can be abandoned between turns without
  // explicit teardown. Ongoing turns can be cancelled via AbortSignal in TurnOptions.
  async stopSession(_sessionId: string): Promise<void> {}
}

// Wraps a completed turn result into an AsyncIterable<AgentEvent> so consumers
// can uniformly iterate events regardless of backend.
function makeCompletedEvents(result: {
  items: Array<Record<string, unknown>>;
  finalResponse: string;
}): AsyncIterable<AgentEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of result.items) {
        const itemType = item["type"];
        const msg = item["message"] as Record<string, unknown> | undefined;

        // assistant message item
        if (
          itemType === "message" &&
          msg?.["role"] === "assistant" &&
          typeof msg?.["content"] === "string"
        ) {
          yield {
            type: "assistant_text" as const,
            data: { text: msg["content"] as string },
          };
          continue;
        }

        // items with tool_calls array
        const toolCalls = item["tool_calls"] as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(toolCalls)) {
          for (const tc of toolCalls) {
            const fn = tc["function"] as Record<string, unknown> | undefined;
            const toolName = (fn?.["name"] ?? tc["name"] ?? "unknown") as string;
            let toolInput: Record<string, unknown> = {};
            const rawArgs = fn?.["arguments"] ?? tc["arguments"];
            if (typeof rawArgs === "string") {
              try {
                toolInput = JSON.parse(rawArgs) as Record<string, unknown>;
              } catch {
                toolInput = { raw: rawArgs };
              }
            } else if (typeof rawArgs === "object" && rawArgs !== null) {
              toolInput = rawArgs as Record<string, unknown>;
            }
            yield { type: "tool_use" as const, data: { tool: toolName, input: toolInput } };
          }
          continue;
        }

        // function_call type items
        if (itemType === "function_call") {
          const toolName = (item["name"] ?? "unknown") as string;
          const rawArgs = item["arguments"];
          let toolInput: Record<string, unknown> = {};
          if (typeof rawArgs === "string") {
            try {
              toolInput = JSON.parse(rawArgs) as Record<string, unknown>;
            } catch {
              toolInput = { raw: rawArgs };
            }
          }
          yield { type: "tool_use" as const, data: { tool: toolName, input: toolInput } };
          continue;
        }

        // fallback
        yield { type: "message" as const, data: item };
      }

      // always emit completed at the end
      yield {
        type: "completed" as const,
        data: { finalResponse: result.finalResponse },
      };
    },
  };
}
