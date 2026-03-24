import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NotifyEvent } from "../../src/notify/types.js";

describe("WebhookNotifier", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Replace the global fetch with a mock that returns a successful response.
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("posts JSON payload to the configured URL", async () => {
    const { WebhookNotifier } = await import("../../src/notify/webhook.js");
    const notifier = new WebhookNotifier("https://hooks.example.com/test");

    const event: NotifyEvent = {
      type: "completed",
      workflow: "fix-issues",
      sessionId: "sess-001",
      message: "All done",
    };

    await notifier.send(event);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("https://hooks.example.com/test");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.text).toBe("[completed] fix-issues: All done");
  });

  it("merges event.metadata into the payload", async () => {
    const { WebhookNotifier } = await import("../../src/notify/webhook.js");
    const notifier = new WebhookNotifier("https://hooks.example.com/slack");

    const event: NotifyEvent = {
      type: "failed",
      workflow: "deploy",
      sessionId: "sess-002",
      message: "Build error",
      metadata: { channel: "#alerts", username: "runweave-bot" },
    };

    await notifier.send(event);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;

    expect(body.text).toBe("[failed] deploy: Build error");
    expect(body.channel).toBe("#alerts");
    expect(body.username).toBe("runweave-bot");
  });

  it("sends correct payload for needs_input event", async () => {
    const { WebhookNotifier } = await import("../../src/notify/webhook.js");
    const notifier = new WebhookNotifier("https://hooks.example.com/discord");

    const event: NotifyEvent = {
      type: "needs_input",
      workflow: "review",
      sessionId: "sess-003",
      message: "Human approval required",
    };

    await notifier.send(event);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;

    expect(body.text).toBe("[needs_input] review: Human approval required");
  });

  it("propagates fetch errors to the caller", async () => {
    fetchMock.mockRejectedValue(new Error("network timeout"));

    const { WebhookNotifier } = await import("../../src/notify/webhook.js");
    const notifier = new WebhookNotifier("https://hooks.example.com/broken");

    const event: NotifyEvent = {
      type: "failed",
      workflow: "ci",
      sessionId: "sess-004",
      message: "Unreachable",
    };

    await expect(notifier.send(event)).rejects.toThrow("network timeout");
  });

  it("uses correct URL regardless of metadata presence", async () => {
    const { WebhookNotifier } = await import("../../src/notify/webhook.js");
    const url = "https://hooks.example.com/unique-endpoint";
    const notifier = new WebhookNotifier(url);

    await notifier.send({
      type: "completed",
      workflow: "w",
      sessionId: "s",
      message: "ok",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(url);
  });
});
