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

  it("passes effort as modelReasoningEffort to threadOptions when provided", async () => {
    await backend.startSession({
      prompt: "High effort task",
      workspacePath: "/tmp/ws",
      mode: "autonomous",
      effort: "high",
    });

    const codexInstance = vi.mocked(Codex).mock.results[0]?.value as {
      startThread: ReturnType<typeof vi.fn>;
    };
    expect(codexInstance.startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        modelReasoningEffort: "high",
      }),
    );
  });

  it("omits modelReasoningEffort from threadOptions when effort is not provided", async () => {
    await backend.startSession({
      prompt: "No effort",
      workspacePath: "/tmp/ws",
      mode: "autonomous",
    });

    const codexInstance = vi.mocked(Codex).mock.results[0]?.value as {
      startThread: ReturnType<typeof vi.fn>;
    };
    const callArg = codexInstance.startThread.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg).not.toHaveProperty("modelReasoningEffort");
  });

  it("stopSession resolves without error", async () => {
    await expect(backend.stopSession("thread-abc")).resolves.toBeUndefined();
  });

  describe("event stream mapping", () => {
    // Helper to collect events from a session with given items
    async function collectEvents(
      items: Array<Record<string, unknown>>,
      finalResponse = "done",
    ): Promise<Array<{ type: string; data: Record<string, unknown> }>> {
      vi.mocked(Codex).mockImplementationOnce(function (
        this: { startThread: ReturnType<typeof vi.fn>; resumeThread: ReturnType<typeof vi.fn> },
      ) {
        const thread = {
          get id() {
            return "thread-map";
          },
          run: vi.fn().mockResolvedValue({ finalResponse, items }),
        };
        this.startThread = vi.fn().mockReturnValue(thread);
        this.resumeThread = vi.fn().mockReturnValue(thread);
      } as unknown as ConstructorParameters<typeof Codex>[0]);

      const session = await backend.startSession({
        prompt: "test",
        workspacePath: "/tmp/ws",
        mode: "autonomous",
      });

      const events: Array<{ type: string; data: Record<string, unknown> }> = [];
      for await (const event of session.events) {
        events.push(event);
      }
      return events;
    }

    it("emits assistant_text event for assistant message items", async () => {
      const events = await collectEvents([
        {
          type: "message",
          message: { role: "assistant", content: "Hello from assistant" },
        },
      ]);

      const textEvent = events.find((e) => e.type === "assistant_text");
      expect(textEvent).toBeDefined();
      expect(textEvent!.data["text"]).toBe("Hello from assistant");
    });

    it("emits tool_use event for items with tool_calls array", async () => {
      const events = await collectEvents([
        {
          type: "tool_call_result",
          tool_calls: [
            {
              function: { name: "Bash", arguments: JSON.stringify({ command: "ls" }) },
            },
          ],
        },
      ]);

      const toolEvent = events.find((e) => e.type === "tool_use");
      expect(toolEvent).toBeDefined();
      expect(toolEvent!.data["tool"]).toBe("Bash");
      expect(toolEvent!.data["input"]).toEqual({ command: "ls" });
    });

    it("emits tool_use event for function_call type items", async () => {
      const events = await collectEvents([
        {
          type: "function_call",
          name: "Read",
          arguments: JSON.stringify({ file_path: "/etc/hosts" }),
        },
      ]);

      const toolEvent = events.find((e) => e.type === "tool_use");
      expect(toolEvent).toBeDefined();
      expect(toolEvent!.data["tool"]).toBe("Read");
      expect(toolEvent!.data["input"]).toEqual({ file_path: "/etc/hosts" });
    });

    it("falls back to message event for unrecognized item types", async () => {
      const events = await collectEvents([
        { type: "weird_unknown_type", payload: "data" },
      ]);

      const messageEvent = events.find((e) => e.type === "message");
      expect(messageEvent).toBeDefined();
      expect(messageEvent!.data["type"]).toBe("weird_unknown_type");
    });

    it("always emits completed as the last event with finalResponse in data", async () => {
      const events = await collectEvents(
        [{ type: "weird_unknown_type", payload: "data" }],
        "final answer here",
      );

      const lastEvent = events[events.length - 1]!;
      expect(lastEvent.type).toBe("completed");
      expect(lastEvent.data["finalResponse"]).toBe("final answer here");
    });

    it("handles tool arguments that are already an object (not a string)", async () => {
      const events = await collectEvents([
        {
          type: "tool_call_result",
          tool_calls: [
            {
              function: { name: "Bash", arguments: { command: "echo hi" } },
            },
          ],
        },
      ]);

      const toolEvent = events.find((e) => e.type === "tool_use");
      expect(toolEvent).toBeDefined();
      expect(toolEvent!.data["input"]).toEqual({ command: "echo hi" });
    });
  });
});
