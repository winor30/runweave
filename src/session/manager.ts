import { randomUUID, createHash } from "node:crypto";
import type { SessionStore } from "./store.js";
import type { SessionMetadata } from "./types.js";
import type { WorkspaceManager } from "../workspace/manager.js";
import type { AgentBackend, AgentSession } from "../agents/types.js";
import type { WorkflowConfig } from "../shared/types.js";
import type { Logger } from "../logging/logger.js";
import { renderPrompt } from "../engine/prompt.js";
import { runHook } from "../workspace/hooks.js";

/**
 * Manages the full lifecycle of a workflow session:
 * concurrency check → workspace provisioning → hooks → prompt render →
 * agent start/resume/stop → metadata persistence.
 */
export class SessionManager {
  constructor(
    private readonly store: SessionStore,
    private readonly workspace: WorkspaceManager,
    private readonly logger: Logger,
  ) {}

  /**
   * Starts a new session for the given workflow.
   *
   * Returns `null` when the concurrency policy requires the run to be
   * skipped (or queued — queue mode is future work and currently also skips).
   */
  async startWorkflow(wf: WorkflowConfig, backend: AgentBackend): Promise<SessionMetadata | null> {
    // Concurrency check — count sessions that have not yet finished
    const existing = await this.store.findByWorkflow(wf.name);
    const running = existing.filter((s) => s.status === "running" || s.status === "pending");
    if (running.length >= wf.concurrency.max) {
      this.logger.info("Skipping workflow — concurrency limit reached", {
        workflow: wf.name,
        running: running.length,
        max: wf.concurrency.max,
      });
      // queue mode is not implemented yet; treat as skip
      return null;
    }

    // Use a short UUID prefix so session IDs stay readable in file paths
    const sessionId = randomUUID().slice(0, 8);
    const wsPath = await this.workspace.ensure(`${wf.name}_${sessionId}`);

    // Run workspace lifecycle hooks sequentially so each can depend on the
    // previous one completing (e.g. after_create clones a repo, before_run installs deps)
    if (wf.workspace.hooks.after_create) {
      await runHook("after_create", wf.workspace.hooks.after_create, wsPath, this.logger);
    }
    if (wf.workspace.hooks.before_run) {
      await runHook("before_run", wf.workspace.hooks.before_run, wsPath, this.logger);
    }

    const renderedPrompt = await renderPrompt(wf.prompt, wf.context);

    const agentSession = await backend.startSession({
      prompt: renderedPrompt,
      workspacePath: wsPath,
      mode: wf.agent.mode,
      model: wf.agent.model,
      providerOptions: wf.agent.provider_options,
    });

    const meta: SessionMetadata = {
      workflow: wf.name,
      session_id: sessionId,
      status: "running",
      agent_backend: wf.agent.backend,
      agent_session_id: agentSession.id,
      workspace: wsPath,
      started_at: new Date().toISOString(),
      // 8-char sha256 prefix used for deduplication and quick comparisons
      prompt_hash: createHash("sha256").update(renderedPrompt).digest("hex").slice(0, 8),
    };
    await this.store.save(meta);
    await this.store.appendEvent(sessionId, {
      ts: new Date().toISOString(),
      type: "started",
      workflow: wf.name,
    });

    this.logger.info("Session started", { workflow: wf.name, session_id: sessionId });

    // Consume the agent event stream in the background so the session status
    // is updated to completed/failed once the agent finishes. Errors during
    // consumption are logged but do not propagate — the session is already
    // started and callers hold a reference to its metadata.
    this.drainAgentEvents(sessionId, agentSession).catch((err) => {
      this.logger.error("Failed to drain agent events", {
        session_id: sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return meta;
  }

  /**
   * Consumes the agent event stream and updates the session status when
   * the stream ends. If the last event is a "completed" type, the session
   * is marked as completed; otherwise it is marked as failed.
   */
  private async drainAgentEvents(sessionId: string, agentSession: AgentSession): Promise<void> {
    let lastEventType: string | undefined;
    for await (const event of agentSession.events) {
      lastEventType = event.type;
      await this.store.appendEvent(sessionId, {
        ts: new Date().toISOString(),
        type: event.type,
        data: event.data,
      });
    }

    const finalStatus = lastEventType === "completed" ? "completed" : "failed";
    await this.store.updateStatus(sessionId, finalStatus);
    await this.store.appendEvent(sessionId, {
      ts: new Date().toISOString(),
      type: finalStatus,
    });
    this.logger.info("Session finished", { session_id: sessionId, status: finalStatus });
  }

  /**
   * Resumes an existing session by forwarding a new prompt to the agent.
   *
   * Returns `null` if the session does not exist in the store.
   */
  async resumeSession(
    sessionId: string,
    prompt: string,
    backend: AgentBackend,
  ): Promise<SessionMetadata | null> {
    const meta = await this.store.read(sessionId);
    if (!meta) return null;

    await backend.resumeSession(meta.agent_session_id, prompt);
    await this.store.updateStatus(sessionId, "running");
    await this.store.appendEvent(sessionId, {
      ts: new Date().toISOString(),
      type: "resumed",
      prompt,
    });

    this.logger.info("Session resumed", { session_id: sessionId });
    return this.store.read(sessionId);
  }

  /**
   * Stops a running session and marks its status as `failed`.
   *
   * Using `failed` rather than a dedicated `stopped` status keeps the status
   * enum small; callers that need to distinguish can check the events log.
   */
  async stopSession(sessionId: string, backend: AgentBackend): Promise<void> {
    const meta = await this.store.read(sessionId);
    if (!meta) return;
    await backend.stopSession(meta.agent_session_id);
    await this.store.updateStatus(sessionId, "failed");
    await this.store.appendEvent(sessionId, {
      ts: new Date().toISOString(),
      type: "stopped",
    });
    this.logger.info("Session stopped", { session_id: sessionId });
  }
}
