import type { NotifyChannelConfig } from "../shared/types.js";
import type { Notifier } from "./types.js";
import { DesktopNotifier } from "./desktop.js";
import { WebhookNotifier } from "./webhook.js";

/** Routes a channel config to the appropriate Notifier implementation. */
export function createNotifier(config: NotifyChannelConfig): Notifier {
  switch (config.type) {
    case "desktop":
      return new DesktopNotifier();
    case "webhook":
      return new WebhookNotifier(config.url);
  }
}
