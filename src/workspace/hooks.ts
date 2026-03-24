import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Logger } from "../logging/logger.js";

const execAsync = promisify(exec);

/**
 * Executes a lifecycle hook command in the given working directory.
 *
 * Hooks are short-lived shell commands (e.g. `git clone`, `npm install`).
 * We cap execution at 60 seconds to prevent a stalled hook from blocking the
 * entire session lifecycle indefinitely.
 *
 * stderr is logged as a warning rather than an error because many well-behaved
 * tools write informational messages there (e.g. npm progress).
 */
export async function runHook(
  hookName: string,
  command: string,
  cwd: string,
  logger: Logger,
): Promise<void> {
  logger.info(`Running hook: ${hookName}`, { command, cwd });
  try {
    const { stdout, stderr } = await execAsync(command, { cwd, timeout: 60_000 });
    if (stdout) logger.debug(`hook ${hookName} stdout`, { output: stdout.trim() });
    if (stderr) logger.warn(`hook ${hookName} stderr`, { output: stderr.trim() });
  } catch (err) {
    logger.error(`Hook ${hookName} failed`, {
      error: err instanceof Error ? err : new Error(String(err)),
    });
    throw err;
  }
}
