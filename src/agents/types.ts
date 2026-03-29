// src/agents/types.ts
import type { AgentEffortLevel, AgentMode } from "../shared/types.js";

export interface AgentBackend {
  readonly provider: "claude-code" | "codex";
  startSession(opts: StartSessionOptions): Promise<AgentSession>;
  resumeSession(sessionId: string, prompt: string): Promise<AgentSession>;
  stopSession(sessionId: string): Promise<void>;
}

export interface AgentSession {
  id: string;
  status: "running" | "completed" | "failed" | "needs_input";
  events: AsyncIterable<AgentEvent>;
}

export interface StartSessionOptions {
  prompt: string;
  workspacePath: string;
  mode: AgentMode;
  model?: string;
  effort?: AgentEffortLevel;
  providerOptions?: Record<string, unknown>;
}

export interface AgentEvent {
  type:
    | "message" // backward-compat fallback for unrecognized SDK messages
    | "assistant_text" // NEW — assistant prose turn
    | "tool_use"
    | "error"
    | "status_change"
    | "completed";
  data: Record<string, unknown>;
}
