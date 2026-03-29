import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";
import type { Notifier, NotifyEvent } from "./types.js";

const execFileAsync = promisify(execFile);

/**
 * Escape double quotes inside an AppleScript string literal.
 * AppleScript uses backslash-escaped double quotes inside double-quoted strings.
 */
function escapeAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export class DesktopNotifier implements Notifier {
  async send(event: NotifyEvent): Promise<void> {
    const title = `runweave: ${event.workflow}`;
    const body = `[${event.type}] ${event.message}`;

    if (platform() === "darwin") {
      // Use execFile instead of exec to avoid shell interpolation — the script
      // string is passed directly to osascript as a single argument, so no
      // shell metacharacter in title/body can escape the argument boundary.
      // We still need to escape double quotes inside the AppleScript string
      // literals because the script itself is a double-quoted AppleScript string.
      const escapedTitle = escapeAppleScript(title);
      const escapedBody = escapeAppleScript(body);
      await execFileAsync("osascript", [
        "-e",
        `display notification "${escapedBody}" with title "${escapedTitle}"`,
      ]);
    } else {
      // execFile passes title and body as separate argv elements to notify-send,
      // so no shell quoting or escaping is needed.
      await execFileAsync("notify-send", [title, body]).catch(() => {
        // notify-send not available on this system — silently ignore so that
        // desktop notifications never block the main workflow execution.
      });
    }
  }
}
