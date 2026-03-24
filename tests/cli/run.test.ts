import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";
import { runCommand } from "../../src/cli/commands/run.js";

const fixtureMinimal = resolve(import.meta.dirname, "../fixtures/workflows/minimal.yaml");

// Mock the heavy engine/session/workspace dependencies so the CLI test does
// not require real file-system workspaces or live agent SDKs.
vi.mock("../../src/engine/executor.js", () => {
  const Executor = vi.fn(function (this: Record<string, unknown>) {
    this["execute"] = vi.fn().mockResolvedValue({
      session_id: "test-1234",
      workflow: "minimal-test",
      status: "running",
      agent_backend: "claude-code",
      agent_session_id: "agent-abc",
      workspace: "/tmp/ws",
      started_at: new Date().toISOString(),
      prompt_hash: "abcdef12",
    });
  });
  return { Executor };
});

vi.mock("../../src/session/store.js", () => {
  const SessionStore = vi.fn(function (this: Record<string, unknown>) {
    this["list"] = vi.fn().mockResolvedValue([]);
    this["findByWorkflow"] = vi.fn().mockResolvedValue([]);
    this["save"] = vi.fn().mockResolvedValue(undefined);
    this["appendEvent"] = vi.fn().mockResolvedValue(undefined);
    this["read"] = vi.fn().mockResolvedValue(null);
  });
  return { SessionStore };
});

vi.mock("../../src/session/manager.js", () => {
  const SessionManager = vi.fn(function (this: Record<string, unknown>) {
    this["startWorkflow"] = vi.fn().mockResolvedValue({
      session_id: "test-1234",
      workflow: "minimal-test",
      status: "running",
      agent_backend: "claude-code",
      agent_session_id: "agent-abc",
      workspace: "/tmp/ws",
      started_at: new Date().toISOString(),
      prompt_hash: "abcdef12",
    });
  });
  return { SessionManager };
});

vi.mock("../../src/workspace/manager.js", () => {
  const WorkspaceManager = vi.fn(function (this: Record<string, unknown>) {
    this["ensure"] = vi.fn().mockResolvedValue("/tmp/ws");
  });
  return { WorkspaceManager };
});

vi.mock("../../src/agents/factory.js", () => ({
  createAgentBackend: vi.fn(() => ({
    provider: "claude-code",
    startSession: vi.fn().mockResolvedValue({
      id: "agent-abc",
      status: "running",
      events: (async function* () {})(),
    }),
    resumeSession: vi.fn().mockResolvedValue(undefined),
    stopSession: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe("run command", () => {
  let consoleOutput: string[];

  beforeEach(() => {
    consoleOutput = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) => {
      consoleOutput.push(msg);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executes a workflow by file path and prints session id", async () => {
    await runCommand([fixtureMinimal]);
    // run command should print the session id of the started session
    expect(consoleOutput.some((line) => line.includes("test-1234"))).toBe(true);
  });

  it("throws when no workflow path is provided", async () => {
    await expect(runCommand([])).rejects.toThrow(/workflow/i);
  });

  it("accepts --context key=value pairs and passes them to executor", async () => {
    const { Executor } = await import("../../src/engine/executor.js");
    const mockExecute = vi.fn().mockResolvedValue({
      session_id: "ctx-session",
      workflow: "minimal-test",
      status: "running",
      agent_backend: "claude-code",
      agent_session_id: "agent-ctx",
      workspace: "/tmp/ws",
      started_at: new Date().toISOString(),
      prompt_hash: "00000000",
    });
    // Replace the mock constructor implementation for this one test
    (Executor as ReturnType<typeof vi.fn>).mockImplementationOnce(
      function (this: Record<string, unknown>) {
        this["execute"] = mockExecute;
      },
    );

    await runCommand([fixtureMinimal, "--context", "env=staging"]);

    expect(mockExecute).toHaveBeenCalledOnce();
    // The workflow passed to execute should have the context merged
    const calledWith = mockExecute.mock.calls[0]![0] as { context: Record<string, string> };
    expect(calledWith.context).toMatchObject({ env: "staging" });
  });
});
