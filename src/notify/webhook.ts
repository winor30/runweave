import type { Notifier, NotifyEvent } from "./types.js";

export class WebhookNotifier implements Notifier {
  constructor(private readonly url: string) {}

  async send(event: NotifyEvent): Promise<void> {
    const payload = {
      text: `[${event.type}] ${event.workflow}: ${event.message}`,
      // Spread metadata last so it can override text if the caller explicitly
      // provides a custom text field — intentional escape hatch for Slack/Discord.
      ...event.metadata,
    };
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // Treat 4xx/5xx as failures — log and continue so the workflow is not blocked.
      if (!response.ok) {
        console.error(
          `WebhookNotifier: HTTP ${response.status} from ${this.url}`,
        );
      }
    } catch (err) {
      // Network-level errors (DNS failure, connection refused, timeout) must not
      // propagate — notifiers are best-effort and must not block workflow execution.
      console.error(`WebhookNotifier: failed to send to ${this.url}`, err);
    }
  }
}
