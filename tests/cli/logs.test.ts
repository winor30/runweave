import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logsCommand } from "../../src/cli/commands/logs.js";
import { SessionStore } from "../../src/session/store.js";

describe("logs command", () => {
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
    tempDir = await mkdtemp(join(tmpdir(), "runweave-logs-test-"));
    store = new SessionStore(tempDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("throws when no session id is provided", async () => {
    await expect(logsCommand([], tempDir)).rejects.toThrow(/session/i);
  });

  it("prints message when session has no events", async () => {
    await logsCommand(["missing-session-id"], tempDir);
    expect(consoleOutput.some((line) => line.includes("no events"))).toBe(true);
  });

  it("prints events for a session in human-readable format", async () => {
    const sessionId = "log-test-01";
    await store.appendEvent(sessionId, {
      ts: "2024-01-01T12:00:00.000Z",
      type: "started",
      workflow: "my-workflow",
    });
    await store.appendEvent(sessionId, {
      ts: "2024-01-01T12:01:00.000Z",
      type: "completed",
    });

    await logsCommand([sessionId], tempDir);

    const output = consoleOutput.join("\n");
    expect(output).toContain("STARTED");
    expect(output).toContain("COMPLETED");
  });

  it("includes event timestamp in the output", async () => {
    const sessionId = "log-ts-test";
    await store.appendEvent(sessionId, {
      ts: "2024-03-15T08:30:45.000Z",
      type: "started",
      workflow: "ts-workflow",
    });

    await logsCommand([sessionId], tempDir);

    const output = consoleOutput.join("\n");
    // formatEvent trims the timestamp to HH:MM:SS
    expect(output).toContain("08:30:45");
  });
});
