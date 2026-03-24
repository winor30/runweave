import { describe, it, expect, vi, beforeEach } from "vitest";
import { Executor } from "../../src/engine/executor.js";
import type { SessionManager } from "../../src/session/manager.js";
import type { AgentBackend } from "../../src/agents/types.js";
import type { WorkflowConfig } from "../../src/shared/types.js";
import { createLogger } from "../../src/logging/logger.js";

describe("Executor", () => {
  let mockSessionManager: SessionManager;
  let mockBackendFactory: (name: string) => AgentBackend;
  let executor: Executor;
  const logger = createLogger({ write: () => {} });

  beforeEach(() => {
    mockSessionManager = {
      startWorkflow: vi.fn().mockResolvedValue({ session_id: "s1", status: "running" }),
      resumeSession: vi.fn(),
      stopSession: vi.fn(),
    } as unknown as SessionManager;

    mockBackendFactory = vi.fn().mockReturnValue({ provider: "claude-code" });

    executor = new Executor(mockSessionManager, mockBackendFactory, logger);
  });

  it("executes a workflow by creating a session", async () => {
    const wf: WorkflowConfig = {
      name: "test",
      trigger: { type: "manual" },
      agent: { backend: "claude-code", mode: "autonomous", provider_options: {} },
      context: {},
      workspace: { root: "/tmp", hooks: {} },
      concurrency: { max: 1, on_conflict: "skip" },
      prompt: "Do it",
    };

    const result = await executor.execute(wf);
    expect(mockSessionManager.startWorkflow).toHaveBeenCalledWith(wf, expect.anything());
    expect(result?.session_id).toBe("s1");
  });

  it("resolves the correct backend from the workflow agent config", async () => {
    const wf: WorkflowConfig = {
      name: "codex-test",
      trigger: { type: "manual" },
      agent: { backend: "codex", mode: "autonomous", provider_options: {} },
      context: {},
      workspace: { root: "/tmp", hooks: {} },
      concurrency: { max: 1, on_conflict: "skip" },
      prompt: "Run codex",
    };

    await executor.execute(wf);
    expect(mockBackendFactory).toHaveBeenCalledWith("codex");
  });

  it("returns null when session manager returns null (concurrency skip)", async () => {
    (mockSessionManager.startWorkflow as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const wf: WorkflowConfig = {
      name: "skipped",
      trigger: { type: "manual" },
      agent: { backend: "claude-code", mode: "autonomous", provider_options: {} },
      context: {},
      workspace: { root: "/tmp", hooks: {} },
      concurrency: { max: 1, on_conflict: "skip" },
      prompt: "Skip me",
    };

    const result = await executor.execute(wf);
    expect(result).toBeNull();
  });
});
