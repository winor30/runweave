import { exec } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";
import type { Notifier, NotifyEvent } from "./types.js";

const execAsync = promisify(exec);

export class DesktopNotifier implements Notifier {
  async send(event: NotifyEvent): Promise<void> {
    const title = `runweave: ${event.workflow}`;
    const body = `[${event.type}] ${event.message}`;

    if (platform() === "darwin") {
      await execAsync(`osascript -e 'display notification "${body}" with title "${title}"'`);
    } else {
      await execAsync(`notify-send "${title}" "${body}"`).catch(() => {
        // notify-send not available on this system — silently ignore so that
        // desktop notifications never block the main workflow execution.
      });
    }
  }
}
