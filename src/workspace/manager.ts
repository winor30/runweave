import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { assertSafePath } from "./path-safety.js";
import { WorkspaceError } from "../shared/errors.js";

/**
 * Manages per-session workspace directories under a shared root.
 *
 * Each session receives an isolated subdirectory named by its session ID.
 * `ensure()` is idempotent: calling it twice for the same ID returns the same
 * path without recreating or clearing the directory, so agents that resume a
 * session find their previous working files intact.
 */
export class WorkspaceManager {
  constructor(private readonly root: string) {}

  /**
   * Returns the workspace path for `sessionId`, creating the directory if it
   * does not yet exist.
   *
   * Rejects session IDs that contain path separators or `..` segments to
   * prevent the caller from constructing a path that escapes the root.
   */
  async ensure(sessionId: string): Promise<string> {
    // Catch embedded slashes, backslashes, or parent-directory references before
    // we even attempt path construction so the error message is unambiguous.
    if (/[/\\]|\.\./.test(sessionId)) {
      throw new WorkspaceError(`WorkspaceError: unsafe session ID — "${sessionId}"`);
    }

    const wsPath = join(this.root, sessionId);
    // Double-check with the canonical resolver in case the regex above misses
    // any platform-specific edge case.
    assertSafePath(this.root, wsPath);

    if (!existsSync(wsPath)) {
      await mkdir(wsPath, { recursive: true });
    }

    return wsPath;
  }
}
