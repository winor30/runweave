import type { AgentBackendName, SessionStatus } from "../shared/types.js";

/** Flat metadata persisted in the `metadata` file alongside `events.jsonl`. */
export interface SessionMetadata {
  workflow: string;
  session_id: string;
  status: SessionStatus;
  agent_backend: AgentBackendName;
  /** Opaque ID returned by the underlying agent SDK for the live session. */
  agent_session_id: string;
  workspace: string;
  started_at: string;
  /** SHA-256 prefix of the rendered prompt — used for deduplication checks. */
  prompt_hash: string;
}

/** A single append-only event stored in `events.jsonl`. */
export interface SessionEvent {
  ts: string;
  type: string;
  [key: string]: unknown;
}
