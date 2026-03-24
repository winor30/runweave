import type {
  AgentConfig,
  ConcurrencyConfig,
  TriggerConfig,
  WorkspaceConfig,
} from "../shared/types.js";

export const DEFAULT_TRIGGER: TriggerConfig = { type: "manual" };

export const DEFAULT_AGENT: AgentConfig = {
  backend: "claude-code",
  mode: "autonomous",
  provider_options: {},
};

export const DEFAULT_WORKSPACE: WorkspaceConfig = {
  root: ".runweave-workspaces",
  hooks: {},
};

export const DEFAULT_CONCURRENCY: ConcurrencyConfig = {
  max: 1,
  on_conflict: "skip",
};

export const DEFAULT_SESSION = {
  ttl_days: 30,
  // 1 hour in milliseconds — intentionally capped to prevent runaway agent sessions
  max_runtime_ms: 3_600_000,
};
