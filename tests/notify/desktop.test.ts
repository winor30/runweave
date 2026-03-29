import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NotifyEvent } from "../../src/notify/types.js";

// Mock child_process before importing the module under test.
// We also mock node:os to control platform detection.
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:os", () => ({
  platform: vi.fn(),
}));

describe("DesktopNotifier", () => {
  let execFileMock: ReturnType<typeof vi.fn>;
  let platformMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const cp = await import("node:child_process");
    const os = await import("node:os");
    execFileMock = cp.execFile as unknown as ReturnType<typeof vi.fn>;
    platformMock = os.platform as unknown as ReturnType<typeof vi.fn>;

    // Default: execFile resolves successfully via promisify's callback convention.
    execFileMock.mockImplementation(
      (
        _file: string,
        _args: string[],
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => {
        cb(null, "", "");
      },
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls osascript with title and body on macOS", async () => {
    platformMock.mockReturnValue("darwin");

    const { DesktopNotifier } = await import("../../src/notify/desktop.js");
    const notifier = new DesktopNotifier();

    const event: NotifyEvent = {
      type: "completed",
      workflow: "fix-issues",
      sessionId: "sess-001",
      message: "All tasks done",
    };

    await notifier.send(event);

    expect(execFileMock).toHaveBeenCalledOnce();
    const [file, args] = execFileMock.mock.calls[0] as [string, string[]];
    expect(file).toBe("osascript");
    expect(args[0]).toBe("-e");
    expect(args[1]).toContain("runweave: fix-issues");
    expect(args[1]).toContain("[completed] All tasks done");
  });

  it("escapes double quotes in title and body for AppleScript on macOS", async () => {
    platformMock.mockReturnValue("darwin");

    const { DesktopNotifier } = await import("../../src/notify/desktop.js");
    const notifier = new DesktopNotifier();

    const event: NotifyEvent = {
      type: "failed",
      workflow: 'workflow "alpha"',
      sessionId: "sess-005",
      message: 'Error: "disk full"',
    };

    await notifier.send(event);

    expect(execFileMock).toHaveBeenCalledOnce();
    const [file, args] = execFileMock.mock.calls[0] as [string, string[]];
    expect(file).toBe("osascript");
    // Double quotes in workflow/message must be backslash-escaped inside the
    // AppleScript string so the script remains syntactically valid.
    expect(args[1]).toContain('runweave: workflow \\"alpha\\"');
    expect(args[1]).toContain('[failed] Error: \\"disk full\\"');
    // The raw (unescaped) quote characters must not appear unescaped.
    expect(args[1]).not.toMatch(/runweave: workflow "[^\\]/);
  });

  it("calls notify-send with title and body as separate arguments on Linux", async () => {
    platformMock.mockReturnValue("linux");

    const { DesktopNotifier } = await import("../../src/notify/desktop.js");
    const notifier = new DesktopNotifier();

    const event: NotifyEvent = {
      type: "failed",
      workflow: "deploy",
      sessionId: "sess-002",
      message: "Build failed",
    };

    await notifier.send(event);

    expect(execFileMock).toHaveBeenCalledOnce();
    const [file, args] = execFileMock.mock.calls[0] as [string, string[]];
    expect(file).toBe("notify-send");
    expect(args[0]).toBe("runweave: deploy");
    expect(args[1]).toBe("[failed] Build failed");
  });

  it("silently ignores notify-send errors on Linux", async () => {
    platformMock.mockReturnValue("linux");

    // Simulate notify-send not being installed.
    execFileMock.mockImplementation(
      (
        _file: string,
        _args: string[],
        cb: (err: Error, stdout: string, stderr: string) => void,
      ) => {
        cb(new Error("notify-send: command not found"), "", "");
      },
    );

    const { DesktopNotifier } = await import("../../src/notify/desktop.js");
    const notifier = new DesktopNotifier();

    const event: NotifyEvent = {
      type: "needs_input",
      workflow: "review",
      sessionId: "sess-003",
      message: "Approval needed",
    };

    // Must not throw even when notify-send is unavailable.
    await expect(notifier.send(event)).resolves.toBeUndefined();
  });

  it("propagates osascript errors on macOS", async () => {
    platformMock.mockReturnValue("darwin");

    execFileMock.mockImplementation(
      (
        _file: string,
        _args: string[],
        cb: (err: Error, stdout: string, stderr: string) => void,
      ) => {
        cb(new Error("osascript failed"), "", "");
      },
    );

    const { DesktopNotifier } = await import("../../src/notify/desktop.js");
    const notifier = new DesktopNotifier();

    const event: NotifyEvent = {
      type: "failed",
      workflow: "build",
      sessionId: "sess-004",
      message: "CI error",
    };

    await expect(notifier.send(event)).rejects.toThrow("osascript failed");
  });
});
