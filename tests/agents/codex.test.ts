// tests/agents/codex.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CodexBackend } from "../../src/agents/codex.js";

// Mock the SDK module — the actual Codex class spawns a local codex CLI process.
// We verify option mapping and session ID surfacing without running the real process.
// Use a class expression so vi.fn() wraps a proper constructor, avoiding the
// "is not a constructor" error that occurs when mockImplementation returns a plain object.
vi.mock("@openai/codex-sdk", () => {
  const mockThread = {
    get id() {
      return "thread-abc";
    },
    run: vi.fn().mockResolvedValue({ finalResponse: "done", items: [], usage: null }),
    runStreamed: vi.fn(),
  };

  const MockCodex = vi.fn(
    function MockCodex(this: {
      startThread: ReturnType<typeof vi.fn>;
      resumeThread: ReturnType<typeof vi.fn>;
    }) {
      this.startThread = vi.fn().mockReturnValue(mockThread);
      this.resumeThread = vi.fn().mockReturnValue(mockThread);
    },
  );

  return { Codex: MockCodex };
});

import { Codex } from "@openai/codex-sdk";

describe("CodexBackend", () => {
  let backend: CodexBackend;

  beforeEach(() => {
    backend = new CodexBackend();
    vi.clearAllMocks();
  });

  it("has correct provider name", () => {
    expect(backend.provider).toBe("codex");
  });

  it("startSession creates thread with autonomous mode settings", async () => {
    const session = await backend.startSession({
      prompt: "Fix the bug",
      workspacePath: "/tmp/ws",
      mode: "autonomous",
    });

    expect(Codex).toHaveBeenCalled();
    const codexInstance = vi.mocked(Codex).mock.results[0]?.value as {
      startThread: ReturnType<typeof vi.fn>;
    };
    expect(codexInstance.startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalPolicy: "never",
        sandboxMode: "workspace-write",
      }),
    );
    expect(session.id).toBe("thread-abc");
  });

  it("maps full-auto mode to danger-full-access sandbox", async () => {
    await backend.startSession({
      prompt: "Deploy",
      workspacePath: "/tmp/ws",
      mode: "full-auto",
    });

    const codexInstance = vi.mocked(Codex).mock.results[0]?.value as {
      startThread: ReturnType<typeof vi.fn>;
    };
    expect(codexInstance.startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
      }),
    );
  });

  it("maps supervised mode to on-request approval and workspace-write sandbox", async () => {
    await backend.startSession({
      prompt: "Review and edit",
      workspacePath: "/tmp/ws",
      mode: "supervised",
    });

    const codexInstance = vi.mocked(Codex).mock.results[0]?.value as {
      startThread: ReturnType<typeof vi.fn>;
    };
    expect(codexInstance.startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
      }),
    );
  });

  it("maps readonly mode to read-only sandbox", async () => {
    await backend.startSession({
      prompt: "Analyze code",
      workspacePath: "/tmp/ws",
      mode: "readonly",
    });

    const codexInstance = vi.mocked(Codex).mock.results[0]?.value as {
      startThread: ReturnType<typeof vi.fn>;
    };
    expect(codexInstance.startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalPolicy: "on-request",
        sandboxMode: "read-only",
      }),
    );
  });

  it("resumeSession calls resumeThread with thread ID", async () => {
    await backend.resumeSession("thread-abc", "Continue");

    const codexInstance = vi.mocked(Codex).mock.results[0]?.value as {
      resumeThread: ReturnType<typeof vi.fn>;
    };
    expect(codexInstance.resumeThread).toHaveBeenCalledWith("thread-abc", expect.any(Object));
  });

  it("resumeSession returns session with correct id", async () => {
    const session = await backend.resumeSession("thread-abc", "Continue");
    expect(session.id).toBe("thread-abc");
  });

  it("session status is completed when run returns successfully", async () => {
    const session = await backend.startSession({
      prompt: "Do work",
      workspacePath: "/tmp/ws",
      mode: "autonomous",
    });
    expect(session.status).toBe("completed");
  });

  it("passes model to threadOptions when provided", async () => {
    await backend.startSession({
      prompt: "Fix the bug",
      workspacePath: "/tmp/ws",
      mode: "autonomous",
      model: "o3-mini",
    });

    const codexInstance = vi.mocked(Codex).mock.results[0]?.value as {
      startThread: ReturnType<typeof vi.fn>;
    };
    expect(codexInstance.startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "o3-mini",
      }),
    );
  });

  it("omits model from threadOptions when not provided", async () => {
    await backend.startSession({
      prompt: "Fix the bug",
      workspacePath: "/tmp/ws",
      mode: "autonomous",
    });

    const codexInstance = vi.mocked(Codex).mock.results[0]?.value as {
      startThread: ReturnType<typeof vi.fn>;
    };
    const callArg = codexInstance.startThread.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg).not.toHaveProperty("model");
  });

  it("stopSession resolves without error", async () => {
    await expect(backend.stopSession("thread-abc")).resolves.toBeUndefined();
  });
});
