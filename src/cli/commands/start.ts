import { resolve } from "node:path";
import { loadAllWorkflows } from "../../config/load.js";
import { Executor } from "../../engine/executor.js";
import { Scheduler } from "../../engine/scheduler.js";
import { SessionManager } from "../../session/manager.js";
import { SessionStore } from "../../session/store.js";
import { WorkspaceManager } from "../../workspace/manager.js";
import { createAgentBackend } from "../../agents/factory.js";
import { createLogger } from "../../logging/logger.js";

/**
 * Parses CLI flags for the start command.
 *
 * Recognized flags:
 *   --workflows <dir>   Directory containing workflow YAML files (default: "workflows")
 *   --no-watch          Disable hot-reload file watching
 */
function parseStartArgs(args: string[]): { workflowsDir: string; watch: boolean } {
  let workflowsDir = "workflows";
  let watch = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--workflows" && i + 1 < args.length) {
      workflowsDir = args[i + 1]!;
      i++;
    } else if (args[i] === "--no-watch") {
      watch = false;
    }
  }

  return { workflowsDir, watch };
}

/**
 * Starts the runweave daemon.
 *
 * All cron-triggered workflows in `workflowsDir` are registered with the
 * Scheduler. Manual workflows are silently ignored by Scheduler.register.
 * A SIGINT handler ensures all jobs are stopped before the process exits.
 *
 * With `--no-watch`, the YAML hot-reload watcher is not started (useful for
 * testing or environments where inotify is not available). The command also
 * returns immediately so tests can assert without blocking on a signal.
 *
 * An optional `signal` argument (AbortSignal) allows tests to terminate the
 * blocking watch loop without emitting a real OS signal, which avoids
 * cross-test contamination.
 */
export async function startCommand(args: string[], signal?: AbortSignal): Promise<void> {
  const { workflowsDir, watch } = parseStartArgs(args);
  const resolvedDir = resolve(workflowsDir);

  const logger = createLogger();

  // Build the dependency stack: Store → WorkspaceManager → SessionManager → Executor → Scheduler
  // Each layer is constructed here so that the daemon owns all resources and
  // can shut them down cleanly on SIGINT.
  const store = new SessionStore(resolve(resolvedDir, "..", ".runweave-sessions"));
  const workspace = new WorkspaceManager(resolve(resolvedDir, "..", ".runweave-workspaces"));
  const sessionManager = new SessionManager(store, workspace, logger);
  const executor = new Executor(sessionManager, (name) => createAgentBackend(name), logger);
  const scheduler = new Scheduler(executor, logger);

  // Load all workflows and register the cron-triggered ones
  const { workflows, errors } = await loadAllWorkflows(resolvedDir);
  for (const wf of workflows) {
    scheduler.register(wf);
  }
  for (const { file, error } of errors) {
    console.error(`WARN: Failed to load ${file}: ${error.message}`);
  }

  console.log(
    `Started runweave daemon — ${workflows.length} workflow(s) loaded from ${resolvedDir}`,
  );

  if (!watch) {
    // Non-blocking mode (used in tests / CI): register jobs and return immediately.
    // No SIGINT handler needed since the process exits normally.
    return;
  }

  scheduler.watchDirectory(resolvedDir);

  // Block until either SIGINT or the optional AbortSignal fires.
  await new Promise<void>((resolvePromise) => {
    const cleanup = (): void => {
      scheduler.stopAll();
      resolvePromise();
    };

    // Allow tests to inject a cancellation signal instead of emitting SIGINT.
    // If the signal is already aborted (e.g. pre-aborted in tests), resolve
    // synchronously to avoid deadlock.
    if (signal?.aborted) {
      cleanup();
      return;
    }

    process.once("SIGINT", cleanup);

    signal?.addEventListener("abort", () => {
      process.removeListener("SIGINT", cleanup);
      cleanup();
    });
  });
}
