// tests/agents/claude.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClaudeBackend } from "../../src/agents/claude.js";

// Mock the SDK module — the actual query function talks to a live Claude Code process.
// We verify that ClaudeBackend passes the right options and correctly surfaces the session ID.
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

import { query } from "@anthropic-ai/claude-agent-sdk";

describe("ClaudeBackend", () => {
  let backend: ClaudeBackend;

  beforeEach(() => {
    backend = new ClaudeBackend();
    vi.clearAllMocks();
  });

  it("has correct provider name", () => {
    expect(backend.provider).toBe("claude-code");
  });

  it("startSession calls SDK query with correct options for autonomous mode", async () => {
    const mockMessages = (async function* () {
      yield { type: "system", subtype: "init", session_id: "test-session-123" };
      yield { type: "result", result: "done" };
    })();

    vi.mocked(query).mockReturnValue(mockMessages as ReturnType<typeof query>);

    const session = await backend.startSession({
      prompt: "Fix the bug",
      workspacePath: "/tmp/ws",
      mode: "autonomous",
    });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Fix the bug",
        options: expect.objectContaining({
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
        }),
      }),
    );
    expect(session.id).toBe("test-session-123");
  });

  it("startSession calls SDK query with correct options for full-auto mode", async () => {
    const mockMessages = (async function* () {
      yield { type: "system", subtype: "init", session_id: "session-full-auto" };
      yield { type: "result", result: "done" };
    })();

    vi.mocked(query).mockReturnValue(mockMessages as ReturnType<typeof query>);

    await backend.startSession({
      prompt: "Auto deploy",
      workspacePath: "/tmp/ws",
      mode: "full-auto",
    });

    // full-auto also maps to bypassPermissions
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
        }),
      }),
    );
  });

  it("maps supervised mode to acceptEdits permission", async () => {
    const mockMessages = (async function* () {
      yield { type: "system", subtype: "init", session_id: "sess-456" };
      yield { type: "result", result: "done" };
    })();

    vi.mocked(query).mockReturnValue(mockMessages as ReturnType<typeof query>);

    await backend.startSession({
      prompt: "Review code",
      workspacePath: "/tmp/ws",
      mode: "supervised",
    });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          permissionMode: "acceptEdits",
        }),
      }),
    );
  });

  it("maps readonly mode to dontAsk permission with restricted tools", async () => {
    const mockMessages = (async function* () {
      yield { type: "system", subtype: "init", session_id: "sess-readonly" };
      yield { type: "result", result: "done" };
    })();

    vi.mocked(query).mockReturnValue(mockMessages as ReturnType<typeof query>);

    await backend.startSession({
      prompt: "Read code",
      workspacePath: "/tmp/ws",
      mode: "readonly",
    });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          permissionMode: "dontAsk",
          allowedTools: ["Read", "Glob", "Grep"],
        }),
      }),
    );
  });

  it("merges providerOptions into SDK options", async () => {
    const mockMessages = (async function* () {
      yield { type: "system", subtype: "init", session_id: "sess-opts" };
      yield { type: "result", result: "done" };
    })();

    vi.mocked(query).mockReturnValue(mockMessages as ReturnType<typeof query>);

    await backend.startSession({
      prompt: "Custom opts",
      workspacePath: "/tmp/ws",
      mode: "autonomous",
      providerOptions: { maxTurns: 5 },
    });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          maxTurns: 5,
        }),
      }),
    );
  });

  it("sets model when provided", async () => {
    const mockMessages = (async function* () {
      yield { type: "system", subtype: "init", session_id: "sess-model" };
      yield { type: "result", result: "done" };
    })();

    vi.mocked(query).mockReturnValue(mockMessages as ReturnType<typeof query>);

    await backend.startSession({
      prompt: "Use specific model",
      workspacePath: "/tmp/ws",
      mode: "supervised",
      model: "claude-opus-4-5",
    });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          model: "claude-opus-4-5",
        }),
      }),
    );
  });

  it("sets workspacePath as cwd", async () => {
    const mockMessages = (async function* () {
      yield { type: "system", subtype: "init", session_id: "sess-cwd" };
      yield { type: "result", result: "done" };
    })();

    vi.mocked(query).mockReturnValue(mockMessages as ReturnType<typeof query>);

    await backend.startSession({
      prompt: "Check cwd",
      workspacePath: "/custom/workspace",
      mode: "autonomous",
    });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          cwd: "/custom/workspace",
        }),
      }),
    );
  });

  it("resumeSession passes resume option", async () => {
    const mockMessages = (async function* () {
      yield { type: "system", subtype: "init", session_id: "sess-789" };
      yield { type: "result", result: "done" };
    })();

    vi.mocked(query).mockReturnValue(mockMessages as ReturnType<typeof query>);

    await backend.resumeSession("sess-789", "Continue");

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Continue",
        options: expect.objectContaining({
          resume: "sess-789",
        }),
      }),
    );
  });

  it("session events async iterable yields message events", async () => {
    const mockMessages = (async function* () {
      yield { type: "system", subtype: "init", session_id: "sess-events" };
      yield { type: "text", text: "Working..." };
      yield { type: "result", result: "done" };
    })();

    vi.mocked(query).mockReturnValue(mockMessages as ReturnType<typeof query>);

    const session = await backend.startSession({
      prompt: "Do something",
      workspacePath: "/tmp/ws",
      mode: "autonomous",
    });

    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    for await (const event of session.events) {
      events.push(event);
    }

    // system/init is consumed silently; text falls back to message; result becomes completed
    expect(events.length).toBeGreaterThan(0);
    const completedEvent = events.find((e) => e.type === "completed");
    expect(completedEvent).toBeDefined();
  });

  describe("event stream mapping", () => {
    it("emits assistant_text event for text content block", async () => {
      const mockMessages = (async function* () {
        yield { type: "system", subtype: "init", session_id: "sess-txt" };
        yield {
          type: "assistant",
          content: [{ type: "text", text: "Hello world" }],
        };
        yield { type: "result", num_turns: 1, total_cost_usd: 0.01 };
      })();
      vi.mocked(query).mockReturnValue(mockMessages as ReturnType<typeof query>);

      const session = await backend.startSession({
        prompt: "Say hello",
        workspacePath: "/tmp/ws",
        mode: "autonomous",
      });

      const events: Array<{ type: string; data: Record<string, unknown> }> = [];
      for await (const event of session.events) {
        events.push(event);
      }

      const textEvent = events.find((e) => e.type === "assistant_text");
      expect(textEvent).toBeDefined();
      expect(textEvent!.data["text"]).toBe("Hello world");
    });

    it("emits tool_use event for tool_use content block", async () => {
      const mockMessages = (async function* () {
        yield { type: "system", subtype: "init", session_id: "sess-tool" };
        yield {
          type: "assistant",
          content: [
            {
              type: "tool_use",
              name: "Bash",
              input: { command: "ls -la" },
            },
          ],
        };
        yield { type: "result" };
      })();
      vi.mocked(query).mockReturnValue(mockMessages as ReturnType<typeof query>);

      const session = await backend.startSession({
        prompt: "List files",
        workspacePath: "/tmp/ws",
        mode: "autonomous",
      });

      const events: Array<{ type: string; data: Record<string, unknown> }> = [];
      for await (const event of session.events) {
        events.push(event);
      }

      const toolEvent = events.find((e) => e.type === "tool_use");
      expect(toolEvent).toBeDefined();
      expect(toolEvent!.data["tool"]).toBe("Bash");
      expect(toolEvent!.data["input"]).toEqual({ command: "ls -la" });
    });

    it("emits multiple events from a single assistant message with mixed content blocks", async () => {
      const mockMessages = (async function* () {
        yield { type: "system", subtype: "init", session_id: "sess-mixed" };
        yield {
          type: "assistant",
          content: [
            { type: "text", text: "I will run bash" },
            { type: "tool_use", name: "Bash", input: { command: "echo hi" } },
          ],
        };
        yield { type: "result" };
      })();
      vi.mocked(query).mockReturnValue(mockMessages as ReturnType<typeof query>);

      const session = await backend.startSession({
        prompt: "Mixed",
        workspacePath: "/tmp/ws",
        mode: "autonomous",
      });

      const events: Array<{ type: string; data: Record<string, unknown> }> = [];
      for await (const event of session.events) {
        events.push(event);
      }

      expect(events.filter((e) => e.type === "assistant_text")).toHaveLength(1);
      expect(events.filter((e) => e.type === "tool_use")).toHaveLength(1);
    });

    it("emits completed event with turns and cost_usd from ResultMessage", async () => {
      const mockMessages = (async function* () {
        yield { type: "system", subtype: "init", session_id: "sess-result" };
        yield { type: "result", num_turns: 3, total_cost_usd: 0.05, is_error: false };
      })();
      vi.mocked(query).mockReturnValue(mockMessages as ReturnType<typeof query>);

      const session = await backend.startSession({
        prompt: "Work",
        workspacePath: "/tmp/ws",
        mode: "autonomous",
      });

      const events: Array<{ type: string; data: Record<string, unknown> }> = [];
      for await (const event of session.events) {
        events.push(event);
      }

      const completedEvent = events.find((e) => e.type === "completed");
      expect(completedEvent).toBeDefined();
      expect(completedEvent!.data["turns"]).toBe(3);
      expect(completedEvent!.data["cost_usd"]).toBe(0.05);
      expect(completedEvent!.data["is_error"]).toBe(false);
    });

    it("emits completed event without optional fields when ResultMessage omits them", async () => {
      const mockMessages = (async function* () {
        yield { type: "system", subtype: "init", session_id: "sess-result-min" };
        yield { type: "result" };
      })();
      vi.mocked(query).mockReturnValue(mockMessages as ReturnType<typeof query>);

      const session = await backend.startSession({
        prompt: "Minimal result",
        workspacePath: "/tmp/ws",
        mode: "autonomous",
      });

      const events: Array<{ type: string; data: Record<string, unknown> }> = [];
      for await (const event of session.events) {
        events.push(event);
      }

      const completedEvent = events.find((e) => e.type === "completed");
      expect(completedEvent).toBeDefined();
      expect(completedEvent!.data).not.toHaveProperty("turns");
      expect(completedEvent!.data).not.toHaveProperty("cost_usd");
    });

    it("does NOT emit an event for system/init message", async () => {
      const mockMessages = (async function* () {
        yield { type: "system", subtype: "init", session_id: "sess-no-emit" };
        yield { type: "result" };
      })();
      vi.mocked(query).mockReturnValue(mockMessages as ReturnType<typeof query>);

      const session = await backend.startSession({
        prompt: "Check init",
        workspacePath: "/tmp/ws",
        mode: "autonomous",
      });

      const events: Array<{ type: string; data: Record<string, unknown> }> = [];
      for await (const event of session.events) {
        events.push(event);
      }

      // No event with type "system" or "message" wrapping the init should appear
      const systemEvents = events.filter(
        (e) => e.type === "message" && e.data["type"] === "system",
      );
      expect(systemEvents).toHaveLength(0);
    });

    it("falls back to message event for unknown SDK message types", async () => {
      const mockMessages = (async function* () {
        yield { type: "system", subtype: "init", session_id: "sess-fallback" };
        yield { type: "unknown_future_type", payload: "something" };
        yield { type: "result" };
      })();
      vi.mocked(query).mockReturnValue(mockMessages as ReturnType<typeof query>);

      const session = await backend.startSession({
        prompt: "Unknown type",
        workspacePath: "/tmp/ws",
        mode: "autonomous",
      });

      const events: Array<{ type: string; data: Record<string, unknown> }> = [];
      for await (const event of session.events) {
        events.push(event);
      }

      const fallbackEvent = events.find(
        (e) => e.type === "message" && e.data["type"] === "unknown_future_type",
      );
      expect(fallbackEvent).toBeDefined();
    });
  });

  it("passes effort to SDK options when provided", async () => {
    const mockMessages = (async function* () {
      yield { type: "system", subtype: "init", session_id: "sess-effort" };
      yield { type: "result", result: "done" };
    })();

    vi.mocked(query).mockReturnValue(mockMessages as ReturnType<typeof query>);

    await backend.startSession({
      prompt: "High effort task",
      workspacePath: "/tmp/ws",
      mode: "autonomous",
      effort: "high",
    });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          effort: "high",
        }),
      }),
    );
  });

  it("omits effort from SDK options when not provided", async () => {
    const mockMessages = (async function* () {
      yield { type: "system", subtype: "init", session_id: "sess-no-effort" };
      yield { type: "result", result: "done" };
    })();

    vi.mocked(query).mockReturnValue(mockMessages as ReturnType<typeof query>);

    await backend.startSession({
      prompt: "No effort specified",
      workspacePath: "/tmp/ws",
      mode: "autonomous",
    });

    const callArg = vi.mocked(query).mock.calls[0]?.[0] as {
      options: Record<string, unknown>;
    };
    expect(callArg.options).not.toHaveProperty("effort");
  });

  it("stopSession resolves without error", async () => {
    await expect(backend.stopSession("any-session-id")).resolves.toBeUndefined();
  });
});
