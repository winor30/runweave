import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stopCommand } from "../../src/cli/commands/stop.js";
import { SessionStore } from "../../src/session/store.js";

// Single shared mock backend so assertions reference the same object used by the command.
const sharedMockBackend = {
  provider: "claude-code" as const,
  startSession: vi.fn(),
  resumeSession: vi.fn(),
  stopSession: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../../src/agents/factory.js", () => ({
  createAgentBackend: vi.fn(() => sharedMockBackend),
}));

describe("stop command", () => {
  let tempDir: string;
  let consoleOutput: string[];
  let store: SessionStore;

  beforeEach(async () => {
    consoleOutput = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) => {
      consoleOutput.push(msg);
    });
    vi.spyOn(console, "error").mockImplementation((msg: string) => {
      consoleOutput.push(msg);
    });
    tempDir = await mkdtemp(join(tmpdir(), "runweave-stop-test-"));
    store = new SessionStore(tempDir);
    await store.save({
      session_id: "stop-session",
      workflow: "stop-workflow",
      status: "running",
      agent_backend: "claude-code",
      agent_session_id: "agent-stop",
      workspace: "/tmp/ws-stop",
      started_at: new Date().toISOString(),
      prompt_hash: "deadbeef",
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("stops a session by id and confirms", async () => {
    sharedMockBackend.stopSession.mockClear();

    await stopCommand(["stop-session"], tempDir);

    expect(sharedMockBackend.stopSession).toHaveBeenCalledWith("agent-stop");
    expect(consoleOutput.some((line) => line.toLowerCase().includes("stop"))).toBe(true);
  });

  it("marks session status as failed after stop", async () => {
    await stopCommand(["stop-session"], tempDir);
    const meta = await store.read("stop-session");
    expect(meta?.status).toBe("failed");
  });

  it("prints error when session not found", async () => {
    await stopCommand(["nonexistent-id"], tempDir);
    expect(consoleOutput.some((line) => line.toLowerCase().includes("not found"))).toBe(true);
  });

  it("throws when no session id is provided", async () => {
    await expect(stopCommand([], tempDir)).rejects.toThrow(/session/i);
  });
});
