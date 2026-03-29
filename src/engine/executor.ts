import type { SessionManager, FinishCallback } from "../session/manager.js";
import type { AgentBackend } from "../agents/types.js";
import type { SessionMetadata } from "../session/types.js";
import type { WorkflowConfig, AgentBackendName } from "../shared/types.js";
import type { Logger } from "../logging/logger.js";
import { createNotifier } from "../notify/factory.js";
import type { NotifyEvent } from "../notify/types.js";

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
   *
   * When `wf.notify` is configured, an `onFinish` callback is built that
   * fires all configured notifiers via `Promise.allSettled` (best-effort:
   * one failing notifier does not block the others).
   */
  async execute(wf: WorkflowConfig): Promise<SessionMetadata | null> {
    this.logger.info("Executing workflow", { workflow: wf.name });
    const backend = this.backendFactory(wf.agent.backend);

    let onFinish: FinishCallback | undefined;
    if (wf.notify && wf.notify.channels.length > 0) {
      const notifiers = wf.notify.channels.map(createNotifier);
      const notifyOn = wf.notify.on;
      onFinish = async (status, sessionId, workflowName) => {
        // Respect per-event-type opt-out flags in notify.on
        if (!notifyOn[status]) return;
        const event: NotifyEvent = {
          type: status,
          workflow: workflowName,
          sessionId,
          message:
            status === "completed" ? "Workflow completed successfully" : "Workflow failed",
        };
        await Promise.allSettled(notifiers.map((n) => n.send(event)));
      };
    }

    return this.sessionManager.startWorkflow(wf, backend, onFinish);
  }
}
