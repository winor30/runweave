import { watch } from "node:fs";
import { SessionStore } from "../../session/store.js";
import { formatEvent } from "../output.js";

/**
 * Parses CLI flags for the logs command.
 *
 *   --follow, -f   Stream new events as they are appended (like `tail -f`)
 */
function parseLogsArgs(args: string[]): { sessionId: string | undefined; follow: boolean } {
  let sessionId: string | undefined;
  let follow = false;

  for (const arg of args) {
    if (arg === "--follow" || arg === "-f") {
      follow = true;
    } else if (!arg.startsWith("-")) {
      sessionId = arg;
    }
  }

  return { sessionId, follow };
}

/**
 * Prints events for a session.
 *
 * With `--follow`, the events file is watched for new lines using `fs.watch`
 * and newly appended events are printed as they arrive. The command blocks
 * until interrupted (SIGINT).
 *
 * `storeDir` is an optional override for tests.
 */
export async function logsCommand(args: string[], storeDir?: string): Promise<void> {
  const { sessionId, follow } = parseLogsArgs(args);

  if (!sessionId) {
    throw new Error("session id is required: runweave logs <session-id>");
  }

  const dir = storeDir ?? ".runweave-sessions";
  const store = new SessionStore(dir);

  const events = await store.readEvents(sessionId);

  if (events.length === 0 && !follow) {
    console.log(`(no events for session ${sessionId})`);
    return;
  }

  for (const event of events) {
    console.log(formatEvent(event as Record<string, unknown>));
  }

  if (!follow) return;

  // --follow: watch the events.jsonl file and print new lines as they arrive.
  // We track the last printed line count so re-reads do not duplicate output.
  let printedCount = events.length;
  const eventsPath = `${dir}/${sessionId}/events.jsonl`;

  await new Promise<void>((resolvePromise) => {
    const watcher = watch(eventsPath, async () => {
      const allEvents = await store.readEvents(sessionId);
      for (let i = printedCount; i < allEvents.length; i++) {
        console.log(formatEvent(allEvents[i]! as Record<string, unknown>));
      }
      printedCount = allEvents.length;
    });

    process.once("SIGINT", () => {
      watcher.close();
      resolvePromise();
    });
  });
}
