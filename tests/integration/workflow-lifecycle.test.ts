/**
 * Integration test: full workflow lifecycle
 *
 * Tests the end-to-end flow from YAML loading through session start, status
 * check, and session stop — using real filesystem I/O (temp directories) and
 * the real SessionStore, WorkspaceManager, and SessionManager, while mocking
 * only the AgentBackend so we do not need live SDK credentials.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorkflow } from "../../src/config/load.js";
import { Executor } from "../../src/engine/executor.js";
import { SessionManager } from "../../src/session/manager.js";
import { SessionStore } from "../../src/session/store.js";
import { WorkspaceManager } from "../../src/workspace/manager.js";
import { createLogger } from "../../src/logging/logger.js";
import type { AgentBackend } from "../../src/agents/types.js";
import { resolve } from "node:path";

const fixtureMinimal = resolve(import.meta.dirname, "../fixtures/workflows/minimal.yaml");

// --- Stub agent backend --------------------------------------------------

function makeStubBackend(): AgentBackend {
  // Never-resolving stream keeps the session in "running" state for the
  // lifetime of each test, which is required for concurrency checks to work
  // reliably regardless of how many awaits precede drainAgentEvents.
  const neverEndingSession = {
    id: "stub-agent-session",
    status: "running" as const,
    events: {
      // oxlint-disable-next-line require-yield -- intentional: stream never resolves to keep session "running"
      async *[Symbol.asyncIterator]() {
        await new Promise<void>(() => {});
      },
    },
  };
  return {
    provider: "claude-code",
    startSession: vi.fn().mockResolvedValue(neverEndingSession),
    resumeSession: vi.fn().mockResolvedValue(neverEndingSession),
    stopSession: vi.fn().mockResolvedValue(undefined),
  };
}

// --- Tests ------------------------------------------------------------------

describe("workflow lifecycle integration", () => {
  let tempDir: string;
  let store: SessionStore;
  let workspace: WorkspaceManager;
  let sessionManager: SessionManager;
  let executor: Executor;
  let backend: AgentBackend;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "runweave-integration-"));
    const sessionsDir = join(tempDir, "sessions");
    const workspacesDir = join(tempDir, "workspaces");

    store = new SessionStore(sessionsDir);
    workspace = new WorkspaceManager(workspacesDir);
    const logger = createLogger();
    sessionManager = new SessionManager(store, workspace, logger);
    backend = makeStubBackend();
    executor = new Executor(sessionManager, () => backend, logger);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("loads a workflow YAML and validates it successfully", async () => {
    const wf = await loadWorkflow(fixtureMinimal);
    expect(wf.name).toBe("minimal-test");
    expect(wf.prompt).toContain("Do something simple");
  });

  it("starts a session and persists metadata", async () => {
    const wf = await loadWorkflow(fixtureMinimal);
    const meta = await executor.execute(wf);

    expect(meta).not.toBeNull();
    expect(meta!.workflow).toBe("minimal-test");
    expect(meta!.status).toBe("running");
    expect(meta!.agent_backend).toBe("claude-code");
  });

  it("lists the started session via SessionStore", async () => {
    const wf = await loadWorkflow(fixtureMinimal);
    const meta = await executor.execute(wf);

    const sessions = await store.list();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.session_id).toBe(meta!.session_id);
  });

  it("appends a started event on session creation", async () => {
    const wf = await loadWorkflow(fixtureMinimal);
    const meta = await executor.execute(wf);

    const events = await store.readEvents(meta!.session_id);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.type).toBe("started");
  });

  it("stops a session and marks it as failed", async () => {
    const wf = await loadWorkflow(fixtureMinimal);
    const meta = await executor.execute(wf);

    await sessionManager.stopSession(meta!.session_id, backend);

    const updated = await store.read(meta!.session_id);
    expect(updated!.status).toBe("failed");

    const events = await store.readEvents(meta!.session_id);
    const stopEvent = events.find((e) => e.type === "stopped");
    expect(stopEvent).toBeDefined();
  });

  it("resumes a session and records the resumed event", async () => {
    const wf = await loadWorkflow(fixtureMinimal);
    const meta = await executor.execute(wf);

    await sessionManager.resumeSession(meta!.session_id, "continue please", backend);

    const events = await store.readEvents(meta!.session_id);
    const resumedEvent = events.find((e) => e.type === "resumed");
    expect(resumedEvent).toBeDefined();
    expect(resumedEvent!["prompt"]).toBe("continue please");
  });

  it("enforces concurrency limits and returns null on overflow", async () => {
    // minimal.yaml defaults to concurrency.max = 1
    const wf = await loadWorkflow(fixtureMinimal);

    const firstMeta = await executor.execute(wf);
    expect(firstMeta).not.toBeNull();

    // Second execution should be skipped due to the concurrency limit
    const secondMeta = await executor.execute(wf);
    expect(secondMeta).toBeNull();

    // Only one session should be in the store
    const sessions = await store.list();
    expect(sessions).toHaveLength(1);
  });
});
