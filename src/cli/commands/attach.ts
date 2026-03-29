import { SessionStore } from "../../session/store.js";
import { SessionManager } from "../../session/manager.js";
import type { FinishCallback } from "../../session/manager.js";
import { WorkspaceManager } from "../../workspace/manager.js";
import { createAgentBackend } from "../../agents/factory.js";
import { createLogger } from "../../logging/logger.js";
import type { NotifyChannelConfig } from "../../shared/types.js";
import { createNotifier } from "../../notify/factory.js";
import type { NotifyEvent } from "../../notify/types.js";

/**
 * Parses CLI flags for the attach command.
 *
 *   --message <text>         Send a one-shot message to the session instead of
 *                            entering interactive mode.
 *   --notify-webhook <url>   Fire a webhook notification when the session finishes.
 *   --notify-desktop         Send a desktop notification when the session finishes.
 */
function parseAttachArgs(args: string[]): {
  sessionId: string | undefined;
  message?: string;
  notifyChannels: NotifyChannelConfig[];
} {
  let sessionId: string | undefined;
  let message: string | undefined;
  const notifyChannels: NotifyChannelConfig[] = [];

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--message" || args[i] === "-m") && i + 1 < args.length) {
      message = args[i + 1];
      i++;
    } else if (args[i] === "--notify-webhook" && i + 1 < args.length) {
      notifyChannels.push({ type: "webhook", url: args[i + 1]! });
      i++;
    } else if (args[i] === "--notify-desktop") {
      notifyChannels.push({ type: "desktop" });
    } else if (!args[i]!.startsWith("-")) {
      sessionId = args[i];
    }
  }

  return { sessionId, message, notifyChannels };
}

/**
 * Attaches to an existing session and sends a message.
 *
 * With `--message <text>` the prompt is sent immediately and the command
 * returns. Without that flag the command enters interactive stdin mode,
 * reading lines until EOF and sending each as a separate prompt.
 *
 * `storeDir` is an optional override for tests.
 */
export async function attachCommand(args: string[], storeDir?: string): Promise<void> {
  const { sessionId, message, notifyChannels } = parseAttachArgs(args);

  if (!sessionId) {
    throw new Error("session id is required: runweave attach <session-id>");
  }

  const dir = storeDir ?? ".runweave-sessions";
  const logger = createLogger();
  const store = new SessionStore(dir);

  const meta = await store.read(sessionId);
  if (!meta) {
    console.error(`Session not found: ${sessionId}`);
    return;
  }

  const workspace = new WorkspaceManager(meta.workspace);
  const sessionManager = new SessionManager(store, workspace, logger);
  const backend = createAgentBackend(meta.agent_backend);

  // Build an onFinish callback that fires all requested notification channels
  // in parallel. allSettled ensures one failing notifier doesn't block others.
  let onFinish: FinishCallback | undefined;
  if (notifyChannels.length > 0) {
    const notifiers = notifyChannels.map(createNotifier);
    onFinish = async (status, sid, workflowName) => {
      const event: NotifyEvent = {
        type: status,
        workflow: workflowName,
        sessionId: sid,
        message: status === "completed" ? "Workflow completed successfully" : "Workflow failed",
      };
      await Promise.allSettled(notifiers.map((n) => n.send(event)));
    };
  }

  if (message !== undefined) {
    await sessionManager.resumeSession(sessionId, message, backend, onFinish);
    console.log(`Sent message to session ${sessionId}`);
    return;
  }

  // Interactive stdin mode: read lines until EOF
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin, terminal: false });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    await sessionManager.resumeSession(sessionId, trimmed, backend, onFinish);
    console.log(`Sent message to session ${sessionId}`);
  }
}
