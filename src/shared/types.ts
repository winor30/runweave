// --- Constants ---

export const SESSION_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "needs_input",
  "timed_out",
] as const;

export const AGENT_MODES = ["autonomous", "full-auto", "supervised", "readonly"] as const;

export const AGENT_BACKENDS = ["claude-code", "codex"] as const;

// All effort levels across all backends. "minimal" and "xhigh" are Codex-native;
// "max" is Claude-native. Cross-backend values are mapped to the nearest equivalent
// at the backend layer.
export const AGENT_EFFORT_LEVELS = ["minimal", "low", "medium", "high", "max", "xhigh"] as const;

// --- Derived Types ---

export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type AgentMode = (typeof AGENT_MODES)[number];
export type AgentBackendName = (typeof AGENT_BACKENDS)[number];
export type AgentEffortLevel = (typeof AGENT_EFFORT_LEVELS)[number];

// --- Trigger ---

export type TriggerConfig = { type: "manual" } | { type: "cron"; schedule: string };

// --- Agent Config ---

export interface AgentConfig {
  backend: AgentBackendName;
  mode: AgentMode;
  model?: string;
  effort?: AgentEffortLevel;
  provider_options: Record<string, unknown>;
}

// --- Concurrency ---

export interface ConcurrencyConfig {
  max: number;
  on_conflict: "skip" | "queue";
}

// --- Workspace ---

export interface WorkspaceHooks {
  after_create?: string;
  before_run?: string;
}

export interface WorkspaceConfig {
  root: string;
  hooks: WorkspaceHooks;
}

// --- Notify ---

export type NotifyChannelConfig = { type: "desktop" } | { type: "webhook"; url: string };

export interface NotifyOnConfig {
  completed: boolean;
  failed: boolean;
  needs_input: boolean;
}

export interface NotifyConfig {
  channels: NotifyChannelConfig[];
  on: NotifyOnConfig;
}

// --- Workflow ---

export interface WorkflowConfig {
  name: string;
  description?: string;
  trigger: TriggerConfig;
  agent: AgentConfig;
  context: Record<string, string>;
  workspace: WorkspaceConfig;
  concurrency: ConcurrencyConfig;
  notify?: NotifyConfig;
  prompt: string;
}

// --- Global Config ---

export interface GlobalConfig {
  session: {
    ttl_days: number;
    max_runtime_ms: number;
  };
  notify?: NotifyConfig;
}
