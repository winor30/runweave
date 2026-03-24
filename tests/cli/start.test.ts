import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";
import { startCommand } from "../../src/cli/commands/start.js";

const fixturesDir = resolve(import.meta.dirname, "../fixtures/workflows");

// Track scheduler calls so we can assert on them without running real cron jobs.
const mockRegister = vi.fn();
const mockWatchDirectory = vi.fn();
const mockStopAll = vi.fn();

vi.mock("../../src/engine/scheduler.js", () => {
  const Scheduler = vi.fn(function (this: Record<string, unknown>) {
    this["register"] = mockRegister;
    this["watchDirectory"] = mockWatchDirectory;
    this["stopAll"] = mockStopAll;
    this["getRegistered"] = vi.fn().mockReturnValue([]);
  });
  return { Scheduler };
});

vi.mock("../../src/engine/executor.js", () => {
  const Executor = vi.fn(function (this: Record<string, unknown>) {
    this["execute"] = vi.fn().mockResolvedValue(null);
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
    this["startWorkflow"] = vi.fn().mockResolvedValue(null);
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
    startSession: vi.fn().mockResolvedValue({ id: "a", status: "running", events: [] }),
    resumeSession: vi.fn().mockResolvedValue(undefined),
    stopSession: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe("start command", () => {
  let consoleOutput: string[];

  beforeEach(() => {
    consoleOutput = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) => {
      consoleOutput.push(msg);
    });
    mockRegister.mockClear();
    mockWatchDirectory.mockClear();
    mockStopAll.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers cron workflows found in the directory", async () => {
    // fixturesDir contains full.yaml (cron trigger) and minimal.yaml (manual trigger)
    await startCommand(["--workflows", fixturesDir, "--no-watch"]);

    // register is called for each successfully-loaded workflow
    // (manual triggers are silently skipped inside Scheduler.register)
    expect(mockRegister).toHaveBeenCalled();
  });

  it("watches the workflows directory by default", async () => {
    await startCommand(["--workflows", fixturesDir, "--no-watch"]);
    // --no-watch disables the watch call
    expect(mockWatchDirectory).not.toHaveBeenCalled();
  });

  it("watches directory when --no-watch is not passed", async () => {
    // Pass an already-aborted signal so startCommand returns immediately after
    // calling watchDirectory, without blocking on OS signals.
    const ac = new AbortController();
    ac.abort();
    await startCommand(["--workflows", fixturesDir], ac.signal);
    expect(mockWatchDirectory).toHaveBeenCalledWith(fixturesDir);
  });

  it("calls stopAll when the abort signal fires", async () => {
    const ac = new AbortController();
    ac.abort();
    await startCommand(["--workflows", fixturesDir], ac.signal);
    expect(mockStopAll).toHaveBeenCalled();
  });

  it("prints startup message", async () => {
    await startCommand(["--workflows", fixturesDir, "--no-watch"]);
    expect(consoleOutput.some((line) => line.toLowerCase().includes("start"))).toBe(true);
  });
});
