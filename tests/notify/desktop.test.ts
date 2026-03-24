import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NotifyEvent } from "../../src/notify/types.js";

// Mock child_process before importing the module under test.
// We also mock node:os to control platform detection.
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

vi.mock("node:os", () => ({
  platform: vi.fn(),
}));

describe("DesktopNotifier", () => {
  // Re-import after mocks are in place. vitest hoists vi.mock() calls, so
  // dynamic import inside each test is not required; a top-level import would
  // be fine too, but dynamic import makes the mock-before-import intent clear.
  let execMock: ReturnType<typeof vi.fn>;
  let platformMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const cp = await import("node:child_process");
    const os = await import("node:os");
    execMock = cp.exec as unknown as ReturnType<typeof vi.fn>;
    platformMock = os.platform as unknown as ReturnType<typeof vi.fn>;

    // Default: exec resolves successfully (util.promisify wraps the callback style).
    // DesktopNotifier uses promisify(exec), so we simulate the node-style callback.
    execMock.mockImplementation(
      (_cmd: string, cb: (err: null, stdout: string, stderr: string) => void) => {
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

    expect(execMock).toHaveBeenCalledOnce();
    const cmd: string = execMock.mock.calls[0][0];
    expect(cmd).toContain("osascript");
    expect(cmd).toContain("runweave: fix-issues");
    expect(cmd).toContain("[completed] All tasks done");
  });

  it("calls notify-send on Linux", async () => {
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

    expect(execMock).toHaveBeenCalledOnce();
    const cmd: string = execMock.mock.calls[0][0];
    expect(cmd).toContain("notify-send");
    expect(cmd).toContain("runweave: deploy");
    expect(cmd).toContain("[failed] Build failed");
  });

  it("silently ignores notify-send errors on Linux", async () => {
    platformMock.mockReturnValue("linux");

    // Simulate notify-send not being available.
    execMock.mockImplementation(
      (_cmd: string, cb: (err: Error, stdout: string, stderr: string) => void) => {
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

    // Must not throw.
    await expect(notifier.send(event)).resolves.toBeUndefined();
  });

  it("propagates osascript errors on macOS", async () => {
    platformMock.mockReturnValue("darwin");

    execMock.mockImplementation(
      (_cmd: string, cb: (err: Error, stdout: string, stderr: string) => void) => {
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
