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

    // The init message, the text event, and the result event all become events
    expect(events.length).toBeGreaterThan(0);
    const completedEvent = events.find((e) => e.type === "completed");
    expect(completedEvent).toBeDefined();
  });

  it("stopSession resolves without error", async () => {
    await expect(backend.stopSession("any-session-id")).resolves.toBeUndefined();
  });
});
