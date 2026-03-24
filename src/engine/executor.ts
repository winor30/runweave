import type { SessionManager } from "../session/manager.js";
import type { AgentBackend } from "../agents/types.js";
import type { SessionMetadata } from "../session/types.js";
import type { WorkflowConfig, AgentBackendName } from "../shared/types.js";
import type { Logger } from "../logging/logger.js";

/**
 * Orchestrates the execution of a single workflow.
 *
 * The Executor is intentionally thin: it resolves the correct AgentBackend
 * for the workflow and delegates all session lifecycle concerns to
 * SessionManager. This keeps session logic in one place and makes Executor
 * trivially unit-testable.
 */
export class Executor {
  constructor(
    private readonly sessionManager: SessionManager,
    private readonly backendFactory: (name: AgentBackendName) => AgentBackend,
    private readonly logger: Logger,
  ) {}

  /**
   * Executes a workflow by starting a new session.
   *
   * Returns `null` when the session manager decides to skip the run
   * (e.g. concurrency limit reached with `on_conflict: skip`).
   */
  async execute(wf: WorkflowConfig): Promise<SessionMetadata | null> {
    this.logger.info("Executing workflow", { workflow: wf.name });
    const backend = this.backendFactory(wf.agent.backend);
    return this.sessionManager.startWorkflow(wf, backend);
  }
}
