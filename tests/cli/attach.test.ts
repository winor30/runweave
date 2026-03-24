import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attachCommand } from "../../src/cli/commands/attach.js";
import { SessionStore } from "../../src/session/store.js";

// A single shared mock backend instance so assertions work across import boundaries.
const sharedMockBackend = {
  provider: "claude-code" as const,
  startSession: vi.fn().mockResolvedValue({ id: "agent-1", status: "running", events: [] }),
  resumeSession: vi.fn().mockResolvedValue({ id: "agent-1", status: "running", events: [] }),
  stopSession: vi.fn().mockResolvedValue(undefined),
};

vi.mock("../../src/agents/factory.js", () => ({
  createAgentBackend: vi.fn(() => sharedMockBackend),
}));

describe("attach command", () => {
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
    tempDir = await mkdtemp(join(tmpdir(), "runweave-attach-test-"));
    store = new SessionStore(tempDir);
    // Seed a live session
    await store.save({
      session_id: "attach-abc",
      workflow: "my-workflow",
      status: "running",
      agent_backend: "claude-code",
      agent_session_id: "agent-live",
      workspace: "/tmp/ws",
      started_at: new Date().toISOString(),
      prompt_hash: "12345678",
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("throws when no session id is provided", async () => {
    await expect(attachCommand([], tempDir)).rejects.toThrow(/session/i);
  });

  it("prints error message when session does not exist", async () => {
    await attachCommand(["nonexistent-id"], tempDir);
    expect(consoleOutput.some((line) => line.toLowerCase().includes("not found"))).toBe(true);
  });

  it("sends a prompt to the session and confirms", async () => {
    sharedMockBackend.resumeSession.mockClear();

    await attachCommand(["attach-abc", "--message", "Hello agent"], tempDir);

    expect(sharedMockBackend.resumeSession).toHaveBeenCalledWith("agent-live", "Hello agent");
    expect(consoleOutput.some((line) => line.toLowerCase().includes("sent"))).toBe(true);
  });
});
