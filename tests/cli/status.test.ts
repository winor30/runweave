import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { statusCommand } from "../../src/cli/commands/status.js";
import { SessionStore } from "../../src/session/store.js";

describe("status command", () => {
  let tempDir: string;
  let consoleOutput: string[];
  let store: SessionStore;

  beforeEach(async () => {
    consoleOutput = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) => {
      consoleOutput.push(msg);
    });
    tempDir = await mkdtemp(join(tmpdir(), "runweave-status-test-"));
    store = new SessionStore(tempDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("prints '(no sessions)' when the store is empty", async () => {
    await statusCommand([], tempDir);
    expect(consoleOutput.some((line) => line.includes("no sessions"))).toBe(true);
  });

  it("displays session rows in table format", async () => {
    await store.save({
      session_id: "abc12345",
      workflow: "my-workflow",
      status: "running",
      agent_backend: "claude-code",
      agent_session_id: "agent-1",
      workspace: "/tmp/ws",
      started_at: "2024-01-01T12:00:00.000Z",
      prompt_hash: "aabbccdd",
    });

    await statusCommand([], tempDir);

    const output = consoleOutput.join("\n");
    expect(output).toContain("abc12345");
    expect(output).toContain("my-workflow");
    expect(output).toContain("running");
  });

  it("shows column headers", async () => {
    await store.save({
      session_id: "def67890",
      workflow: "test-wf",
      status: "completed",
      agent_backend: "codex",
      agent_session_id: "agent-2",
      workspace: "/tmp/ws2",
      started_at: "2024-01-02T09:00:00.000Z",
      prompt_hash: "11223344",
    });

    await statusCommand([], tempDir);

    const output = consoleOutput.join("\n");
    // Table headers should appear
    expect(output.toLowerCase()).toMatch(/session|workflow|status/);
  });

  it("filters by workflow name when --workflow flag is provided", async () => {
    await store.save({
      session_id: "session-a",
      workflow: "workflow-a",
      status: "running",
      agent_backend: "claude-code",
      agent_session_id: "agent-a",
      workspace: "/tmp/wsa",
      started_at: "2024-01-01T10:00:00.000Z",
      prompt_hash: "aaaaaaaa",
    });
    await store.save({
      session_id: "session-b",
      workflow: "workflow-b",
      status: "completed",
      agent_backend: "claude-code",
      agent_session_id: "agent-b",
      workspace: "/tmp/wsb",
      started_at: "2024-01-01T11:00:00.000Z",
      prompt_hash: "bbbbbbbb",
    });

    await statusCommand(["--workflow", "workflow-a"], tempDir);

    const output = consoleOutput.join("\n");
    expect(output).toContain("session-a");
    expect(output).not.toContain("session-b");
  });
});
