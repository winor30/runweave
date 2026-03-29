// src/agents/claude.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentBackend, AgentSession, AgentEvent, StartSessionOptions } from "./types.js";
import type { AgentEffortLevel, AgentMode } from "../shared/types.js";

// Maps runweave AgentMode to the Claude Agent SDK permissionMode and related options.
// autonomous / full-auto both use bypassPermissions so the agent never blocks waiting
// for user approval — appropriate when the operator trusts the agent fully.
// supervised uses acceptEdits so the agent can read and suggest edits but the caller
// retains final approval (canUseTool callback is wired up by SessionManager).
// readonly restricts to non-mutating tools and uses dontAsk to prevent any write prompt.
function mapModeToClaudeOptions(mode: AgentMode): Record<string, unknown> {
  switch (mode) {
    case "autonomous":
    case "full-auto":
      return {
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      };
    case "supervised":
      return {
        permissionMode: "acceptEdits",
      };
    case "readonly":
      return {
        permissionMode: "dontAsk",
        allowedTools: ["Read", "Glob", "Grep"],
      };
  }
}

// Maps runweave effort level to the Claude Agent SDK effort value.
// Schema validation rejects "minimal" and "xhigh" (Codex-only) before this point,
// so they should never arrive here. The explicit throws guard against bypassed validation.
function mapEffortToClaude(effort: AgentEffortLevel): "low" | "medium" | "high" | "max" {
  switch (effort) {
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "max":
      return "max";
    case "minimal":
    case "xhigh":
      throw new Error(`effort '${effort}' is not supported by claude-code backend`);
    default: {
      const _exhaustive: never = effort;
      throw new Error(`Unknown effort level: ${_exhaustive}`);
    }
  }
}

export class ClaudeBackend implements AgentBackend {
  readonly provider = "claude-code" as const;

  async startSession(opts: StartSessionOptions): Promise<AgentSession> {
    const sdkOptions: Record<string, unknown> = {
      cwd: opts.workspacePath,
      ...mapModeToClaudeOptions(opts.mode),
      ...(opts.model !== undefined ? { model: opts.model } : {}),
      ...(opts.effort !== undefined ? { effort: mapEffortToClaude(opts.effort) } : {}),
      ...opts.providerOptions,
    };

    const stream = query({
      prompt: opts.prompt,
      options: sdkOptions as Parameters<typeof query>[0]["options"],
    });

    return this.consumeStream(stream);
  }

  async resumeSession(sessionId: string, prompt: string): Promise<AgentSession> {
    const stream = query({
      prompt,
      options: {
        resume: sessionId,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      } as Parameters<typeof query>[0]["options"],
    });

    return this.consumeStream(stream);
  }

  // stopSession is a no-op at this layer: the caller should abort the AbortController
  // passed via providerOptions.abortController, which signals the SDK stream to stop.
  async stopSession(_sessionId: string): Promise<void> {}

  private async consumeStream(
    stream: AsyncIterable<Record<string, unknown>>,
  ): Promise<AgentSession> {
    let sessionId = "";

    // Adapt the SDK's raw message stream into our typed AgentEvent stream.
    // We read the first message eagerly to extract the session ID so that
    // the returned AgentSession.id is populated before the caller iterates events.
    async function* makeEventStream(): AsyncGenerator<AgentEvent> {
      for await (const message of stream) {
        if (message["type"] === "system" && message["subtype"] === "init") {
          sessionId = message["session_id"] as string;
        }
        const eventType: AgentEvent["type"] =
          message["type"] === "result" ? "completed" : "message";
        yield { type: eventType, data: message };
      }
    }

    const iterator = makeEventStream();
    const first = await iterator.next();

    // Build the session object; wrap the generator so consumers see all events
    // including the already-consumed first one.
    return {
      get id() {
        return sessionId;
      },
      status: "running",
      events: {
        async *[Symbol.asyncIterator]() {
          if (!first.done) {
            yield first.value;
          }
          yield* iterator;
        },
      },
    };
  }
}
