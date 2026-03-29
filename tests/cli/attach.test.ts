import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attachCommand } from "../../src/cli/commands/attach.js";
import { SessionStore } from "../../src/session/store.js";

// Empty async generator used as a stand-in for AgentSession.events.
// Recreated in beforeEach so each test gets a fresh iterator.
function emptyAsyncEvents() {
  return (async function* () {})();
}

// A single shared mock backend instance so assertions work across import boundaries.
const sharedMockBackend = {
  provider: "claude-code" as const,
  startSession: vi.fn(),
  resumeSession: vi.fn(),
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
    // Reset mocks so each test gets a fresh AsyncIterable for events
    sharedMockBackend.startSession.mockResolvedValue({
      id: "agent-1",
      status: "running",
      events: emptyAsyncEvents(),
    });
    sharedMockBackend.resumeSession.mockResolvedValue({
      id: "agent-1",
      status: "running",
      events: emptyAsyncEvents(),
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

  it("passes an onFinish callback to resumeSession when --notify-webhook is given", async () => {
    // Spy on SessionManager.resumeSession to capture the 4th argument
    const { SessionManager } = await import("../../src/session/manager.js");
    const resumeSpy = vi.spyOn(SessionManager.prototype, "resumeSession");

    await attachCommand(
      ["attach-abc", "--message", "ping", "--notify-webhook", "https://example.com/hook"],
      tempDir,
    );

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    const [, , , onFinish] = resumeSpy.mock.calls[0]!;
    // A callback must have been wired up
    expect(typeof onFinish).toBe("function");
  });

  it("passes an onFinish callback to resumeSession when --notify-desktop is given", async () => {
    const { SessionManager } = await import("../../src/session/manager.js");
    const resumeSpy = vi.spyOn(SessionManager.prototype, "resumeSession");

    await attachCommand(["attach-abc", "--message", "ping", "--notify-desktop"], tempDir);

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    const [, , , onFinish] = resumeSpy.mock.calls[0]!;
    expect(typeof onFinish).toBe("function");
  });

  it("passes no onFinish when no notify flags are given", async () => {
    const { SessionManager } = await import("../../src/session/manager.js");
    const resumeSpy = vi.spyOn(SessionManager.prototype, "resumeSession");

    await attachCommand(["attach-abc", "--message", "ping"], tempDir);

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    const [, , , onFinish] = resumeSpy.mock.calls[0]!;
    expect(onFinish).toBeUndefined();
  });
});
