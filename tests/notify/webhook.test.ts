import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NotifyEvent } from "../../src/notify/types.js";

describe("WebhookNotifier", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    // Suppress console.error output in tests while capturing calls.
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("posts correct JSON payload to the configured URL on success", async () => {
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
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.text).toBe("[completed] fix-issues: All done");
    // No error logged on success.
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("does not throw when fetch rejects (network error)", async () => {
    fetchMock.mockRejectedValue(new Error("network timeout"));

    const { WebhookNotifier } = await import("../../src/notify/webhook.js");
    const notifier = new WebhookNotifier("https://hooks.example.com/broken");

    const event: NotifyEvent = {
      type: "failed",
      workflow: "ci",
      sessionId: "sess-004",
      message: "Unreachable",
    };

    // Must resolve without throwing — workflow must not be blocked.
    await expect(notifier.send(event)).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    expect(consoleErrorSpy.mock.calls[0][0]).toContain(
      "https://hooks.example.com/broken",
    );
  });

  it("does not throw when server returns HTTP 500", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    const { WebhookNotifier } = await import("../../src/notify/webhook.js");
    const notifier = new WebhookNotifier("https://hooks.example.com/server-error");

    const event: NotifyEvent = {
      type: "failed",
      workflow: "deploy",
      sessionId: "sess-005",
      message: "Internal error",
    };

    await expect(notifier.send(event)).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    expect(consoleErrorSpy.mock.calls[0][0]).toContain("HTTP 500");
    expect(consoleErrorSpy.mock.calls[0][0]).toContain(
      "https://hooks.example.com/server-error",
    );
  });

  it("does not throw when server returns HTTP 404", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    const { WebhookNotifier } = await import("../../src/notify/webhook.js");
    const notifier = new WebhookNotifier("https://hooks.example.com/not-found");

    const event: NotifyEvent = {
      type: "completed",
      workflow: "check",
      sessionId: "sess-006",
      message: "Done",
    };

    await expect(notifier.send(event)).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    expect(consoleErrorSpy.mock.calls[0][0]).toContain("HTTP 404");
  });

  it("spreads metadata fields into the payload", async () => {
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
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
