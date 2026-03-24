import { SessionStore } from "../../session/store.js";
import { formatTable } from "../output.js";

/**
 * Parses CLI flags for the status command.
 *
 *   --workflow <name>   Filter sessions by workflow name
 */
function parseStatusArgs(args: string[]): { workflowFilter?: string } {
  let workflowFilter: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--workflow" && i + 1 < args.length) {
      workflowFilter = args[i + 1];
      i++;
    }
  }

  return { workflowFilter };
}

/**
 * Displays session status in a human-readable table.
 *
 * `storeDir` is an optional override used by tests to point at a temporary
 * directory rather than the default `.runweave-sessions` path.
 */
export async function statusCommand(args: string[], storeDir?: string): Promise<void> {
  const { workflowFilter } = parseStatusArgs(args);
  const dir = storeDir ?? ".runweave-sessions";

  const store = new SessionStore(dir);
  const allSessions = await store.list();

  const sessions = workflowFilter
    ? allSessions.filter((s) => s.workflow === workflowFilter)
    : allSessions;

  const rows = sessions.map((s) => ({
    SESSION: s.session_id,
    WORKFLOW: s.workflow,
    STATUS: s.status,
    BACKEND: s.agent_backend,
    STARTED: s.started_at.slice(0, 19).replace("T", " "),
  }));

  console.log(formatTable(rows, ["SESSION", "WORKFLOW", "STATUS", "BACKEND", "STARTED"]));
}
