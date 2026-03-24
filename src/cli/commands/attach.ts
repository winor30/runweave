import { SessionStore } from "../../session/store.js";
import { SessionManager } from "../../session/manager.js";
import { WorkspaceManager } from "../../workspace/manager.js";
import { createAgentBackend } from "../../agents/factory.js";
import { createLogger } from "../../logging/logger.js";

/**
 * Parses CLI flags for the attach command.
 *
 *   --message <text>   Send a one-shot message to the session instead of
 *                      entering interactive mode.
 */
function parseAttachArgs(args: string[]): { sessionId: string | undefined; message?: string } {
  let sessionId: string | undefined;
  let message: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--message" || args[i] === "-m") && i + 1 < args.length) {
      message = args[i + 1];
      i++;
    } else if (!args[i]!.startsWith("-")) {
      sessionId = args[i];
    }
  }

  return { sessionId, message };
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
  const { sessionId, message } = parseAttachArgs(args);

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

  if (message !== undefined) {
    await sessionManager.resumeSession(sessionId, message, backend);
    console.log(`Sent message to session ${sessionId}`);
    return;
  }

  // Interactive stdin mode: read lines until EOF
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin, terminal: false });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    await sessionManager.resumeSession(sessionId, trimmed, backend);
    console.log(`Sent message to session ${sessionId}`);
  }
}
