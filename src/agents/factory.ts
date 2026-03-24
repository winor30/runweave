// src/agents/factory.ts
import type { AgentBackendName } from "../shared/types.js";
import type { AgentBackend } from "./types.js";
import { ClaudeBackend } from "./claude.js";
import { CodexBackend } from "./codex.js";
import { AgentError } from "../shared/errors.js";

/**
 * Returns the AgentBackend implementation for the given backend name.
 * Throws AgentError for unrecognized backend names so callers get a clear
 * failure rather than a silent no-op.
 */
export function createAgentBackend(name: AgentBackendName): AgentBackend {
  switch (name) {
    case "claude-code":
      return new ClaudeBackend();
    case "codex":
      return new CodexBackend();
    default:
      throw new AgentError(`Unknown agent backend: ${name as string}`);
  }
}
