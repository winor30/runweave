import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "../../src/session/manager.js";
import { SessionStore } from "../../src/session/store.js";
import { WorkspaceManager } from "../../src/workspace/manager.js";
import type { AgentBackend, AgentSession } from "../../src/agents/types.js";
import type { WorkflowConfig } from "../../src/shared/types.js";
import { createLogger } from "../../src/logging/logger.js";

function createMockBackend(): AgentBackend {
  const mockSession: AgentSession = {
    id: "agent-sess-123",
    status: "running",
    // Never-resolving stream: the session stays "running" for the lifetime of
    // the test, which is the realistic state that concurrency checks depend on.
    events: {
      // oxlint-disable-next-line require-yield -- intentional: stream never resolves to keep session "running"
      async *[Symbol.asyncIterator]() {
        await new Promise<void>(() => {});
      },
    },
  };
  return {
    provider: "claude-code",
    startSession: vi.fn().mockResolvedValue(mockSession),
    resumeSession: vi.fn().mockResolvedValue(mockSession),
    stopSession: vi.fn().mockResolvedValue(undefined),
  };
}

function createMinimalWorkflow(overrides?: Partial<WorkflowConfig>): WorkflowConfig {
  return {
    name: "test-wf",
    trigger: { type: "manual" },
    agent: { backend: "claude-code", mode: "autonomous", provider_options: {} },
    context: {},
    workspace: { root: "", hooks: {} },
    concurrency: { max: 1, on_conflict: "skip" },
    prompt: "Do something",
    ...overrides,
  };
}

describe("SessionManager", () => {
  let tempDir: string;
  let store: SessionStore;
  let wsManager: WorkspaceManager;
  let manager: SessionManager;
  let mockBackend: AgentBackend;
  const logger = createLogger({ write: () => {} });

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "runweave-mgr-test-"));
    store = new SessionStore(join(tempDir, "sessions"));
    wsManager = new WorkspaceManager(join(tempDir, "workspaces"));
    mockBackend = createMockBackend();
    manager = new SessionManager(store, wsManager, logger);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  it("starts a workflow session", async () => {
    const wf = createMinimalWorkflow({
      workspace: { root: join(tempDir, "workspaces"), hooks: {} },
    });
    const session = await manager.startWorkflow(wf, mockBackend);

    expect(session).not.toBeNull();
    expect(session!.status).toBe("running");
    expect(mockBackend.startSession).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "Do something", mode: "autonomous" }),
    );
  });

  it("persists session metadata to store after start", async () => {
    const wf = createMinimalWorkflow({
      workspace: { root: join(tempDir, "workspaces"), hooks: {} },
    });
    const session = await manager.startWorkflow(wf, mockBackend);

    const stored = await store.read(session!.session_id);
    expect(stored).not.toBeNull();
    expect(stored!.workflow).toBe("test-wf");
    expect(stored!.agent_backend).toBe("claude-code");
  });

  it("skips if concurrency limit reached", async () => {
    const wf = createMinimalWorkflow({
      workspace: { root: join(tempDir, "workspaces"), hooks: {} },
      concurrency: { max: 1, on_conflict: "skip" },
    });

    // Start first session
    await manager.startWorkflow(wf, mockBackend);

    // Second should be skipped because first is still "running"
    const second = await manager.startWorkflow(wf, mockBackend);
    expect(second).toBeNull();
    // startSession called only once
    expect(mockBackend.startSession).toHaveBeenCalledTimes(1);
  });

  it("allows a new session when concurrency allows it", async () => {
    const wf = createMinimalWorkflow({
      workspace: { root: join(tempDir, "workspaces"), hooks: {} },
      concurrency: { max: 2, on_conflict: "skip" },
    });

    await manager.startWorkflow(wf, mockBackend);
    const second = await manager.startWorkflow(wf, mockBackend);
    expect(second).not.toBeNull();
    expect(mockBackend.startSession).toHaveBeenCalledTimes(2);
  });

  it("resumes an existing session", async () => {
    const wf = createMinimalWorkflow({
      workspace: { root: join(tempDir, "workspaces"), hooks: {} },
    });
    const first = await manager.startWorkflow(wf, mockBackend);

    const resumed = await manager.resumeSession(first!.session_id, "Continue", mockBackend);
    expect(resumed).not.toBeNull();
    expect(mockBackend.resumeSession).toHaveBeenCalledWith("agent-sess-123", "Continue");
  });

  it("returns null when resuming a non-existent session", async () => {
    const result = await manager.resumeSession("no-such-id", "prompt", mockBackend);
    expect(result).toBeNull();
    expect(mockBackend.resumeSession).not.toHaveBeenCalled();
  });

  it("stops a session and marks it as failed", async () => {
    const wf = createMinimalWorkflow({
      workspace: { root: join(tempDir, "workspaces"), hooks: {} },
    });
    const session = await manager.startWorkflow(wf, mockBackend);

    await manager.stopSession(session!.session_id, mockBackend);
    expect(mockBackend.stopSession).toHaveBeenCalledWith("agent-sess-123");

    const stored = await store.read(session!.session_id);
    expect(stored!.status).toBe("failed");
  });

  it("generates a prompt_hash from the rendered prompt", async () => {
    const wf = createMinimalWorkflow({
      workspace: { root: join(tempDir, "workspaces"), hooks: {} },
      prompt: "Hello world",
    });
    const session = await manager.startWorkflow(wf, mockBackend);

    // prompt_hash is an 8-char hex prefix of sha256
    expect(session!.prompt_hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("appends a started event to the session store", async () => {
    const wf = createMinimalWorkflow({
      workspace: { root: join(tempDir, "workspaces"), hooks: {} },
    });
    const session = await manager.startWorkflow(wf, mockBackend);

    const events = await store.readEvents(session!.session_id);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]!.type).toBe("started");
  });

  describe("resumeSession with onFinish", () => {
    /** Creates a backend whose event stream emits a single event then closes. */
    function createFinishingBackend(lastEventType: string): AgentBackend {
      const completingSession: AgentSession = {
        id: "agent-sess-finish",
        status: "running",
        events: {
          async *[Symbol.asyncIterator]() {
            yield { type: lastEventType, data: undefined };
          },
        },
      };
      return {
        provider: "claude-code",
        startSession: vi.fn().mockResolvedValue(completingSession),
        resumeSession: vi.fn().mockResolvedValue(completingSession),
        stopSession: vi.fn().mockResolvedValue(undefined),
      };
    }

    it("calls onFinish with 'completed' after the event stream ends with a completed event", async () => {
      const finishingBackend = createFinishingBackend("completed");
      const wf = createMinimalWorkflow({
        workspace: { root: join(tempDir, "workspaces"), hooks: {} },
      });
      const session = await manager.startWorkflow(wf, finishingBackend);

      const onFinish = vi.fn().mockResolvedValue(undefined);
      await manager.resumeSession(session!.session_id, "continue", finishingBackend, onFinish);

      // drainAgentEvents runs in the background; wait for microtasks to settle
      await new Promise((r) => setTimeout(r, 50));

      expect(onFinish).toHaveBeenCalledOnce();
      expect(onFinish).toHaveBeenCalledWith("completed", session!.session_id, "test-wf");
    });

    it("calls onFinish with 'failed' when the event stream ends without a completed event", async () => {
      const finishingBackend = createFinishingBackend("error");
      const wf = createMinimalWorkflow({
        workspace: { root: join(tempDir, "workspaces"), hooks: {} },
      });
      const session = await manager.startWorkflow(wf, finishingBackend);

      const onFinish = vi.fn().mockResolvedValue(undefined);
      await manager.resumeSession(session!.session_id, "continue", finishingBackend, onFinish);

      await new Promise((r) => setTimeout(r, 50));

      expect(onFinish).toHaveBeenCalledWith("failed", session!.session_id, "test-wf");
    });

    it("does not change session status when onFinish throws", async () => {
      const finishingBackend = createFinishingBackend("completed");
      const wf = createMinimalWorkflow({
        workspace: { root: join(tempDir, "workspaces"), hooks: {} },
      });
      const session = await manager.startWorkflow(wf, finishingBackend);

      // onFinish throws but the session should still be marked completed
      const onFinish = vi.fn().mockRejectedValue(new Error("notify exploded"));
      await manager.resumeSession(session!.session_id, "continue", finishingBackend, onFinish);

      await new Promise((r) => setTimeout(r, 50));

      const stored = await store.read(session!.session_id);
      expect(stored!.status).toBe("completed");
    });
  });

  it("appends a prompt event as the second event after started", async () => {
    const wf = createMinimalWorkflow({
      workspace: { root: join(tempDir, "workspaces"), hooks: {} },
      prompt: "Do something useful",
    });
    const session = await manager.startWorkflow(wf, mockBackend);

    const events = await store.readEvents(session!.session_id);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0]!.type).toBe("started");
    expect(events[1]!.type).toBe("prompt");
  });

  it("prompt event text matches the rendered prompt exactly", async () => {
    const wf = createMinimalWorkflow({
      workspace: { root: join(tempDir, "workspaces"), hooks: {} },
      prompt: "Fix the critical bug in production",
    });
    const session = await manager.startWorkflow(wf, mockBackend);

    const events = await store.readEvents(session!.session_id);
    const promptEvent = events.find((e) => e.type === "prompt");
    expect(promptEvent).toBeDefined();
    expect(promptEvent!["text"]).toBe("Fix the critical bug in production");
  });
});
