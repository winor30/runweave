import { SessionStore } from "../../session/store.js";
import { SessionManager } from "../../session/manager.js";
import { WorkspaceManager } from "../../workspace/manager.js";
import { createAgentBackend } from "../../agents/factory.js";
import { createLogger } from "../../logging/logger.js";

/**
 * Stops a running session identified by its session ID.
 *
 * The agent session is stopped via the backend, the session status is updated
 * to `failed`, and a `stopped` event is appended to the events log.
 *
 * `storeDir` is an optional override for tests.
 */
export async function stopCommand(args: string[], storeDir?: string): Promise<void> {
  const sessionId = args[0];

  if (!sessionId) {
    throw new Error("session id is required: runweave stop <session-id>");
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

  await sessionManager.stopSession(sessionId, backend);
  console.log(`Stopped session: ${sessionId}`);
}
