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
    await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
}
