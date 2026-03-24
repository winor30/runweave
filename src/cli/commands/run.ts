import { resolve } from "node:path";
import { loadWorkflow } from "../../config/load.js";
import { Executor } from "../../engine/executor.js";
import { SessionManager } from "../../session/manager.js";
import { SessionStore } from "../../session/store.js";
import { WorkspaceManager } from "../../workspace/manager.js";
import { createAgentBackend } from "../../agents/factory.js";
import { createLogger } from "../../logging/logger.js";

/**
 * Parses "--context key=value" pairs from the remaining args array.
 *
 * Multiple --context flags are allowed and are merged left-to-right.
 * Values that contain "=" are handled correctly because only the first "="
 * is treated as the key/value separator.
 */
function parseContextFlags(args: string[]): Record<string, string> {
  const ctx: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--context" && i + 1 < args.length) {
      const pair = args[i + 1]!;
      const eqIdx = pair.indexOf("=");
      if (eqIdx > 0) {
        ctx[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
      }
      i++; // skip the value token
    }
  }
  return ctx;
}

/**
 * Runs a single workflow immediately (non-daemon, blocking until the session
 * has been started and its session ID printed).
 *
 * Usage: runweave run <workflow.yaml> [--context key=value ...]
 */
export async function runCommand(args: string[]): Promise<void> {
  const workflowPath = args[0];
  if (!workflowPath) {
    throw new Error("workflow path is required: runweave run <workflow.yaml>");
  }

  const wf = await loadWorkflow(resolve(workflowPath));

  // Merge any --context overrides on top of the workflow's declared context
  const extraContext = parseContextFlags(args.slice(1));
  const mergedWf = {
    ...wf,
    context: { ...wf.context, ...extraContext },
  };

  const logger = createLogger();
  const store = new SessionStore(".runweave-sessions");
  const workspace = new WorkspaceManager(mergedWf.workspace.root);
  const sessionManager = new SessionManager(store, workspace, logger);
  const executor = new Executor(sessionManager, (name) => createAgentBackend(name), logger);

  const meta = await executor.execute(mergedWf);

  if (meta === null) {
    console.log("Skipped — concurrency limit reached.");
  } else {
    console.log(`Started session: ${meta.session_id} (workflow: ${meta.workflow})`);
  }
}
