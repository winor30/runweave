import { resolve } from "node:path";
import { WorkspaceError } from "../shared/errors.js";

/**
 * Asserts that `target` resolves to a path strictly within `root`.
 *
 * We use `resolve()` to canonicalize both paths, eliminating `..` segments and
 * trailing slashes before comparison. This prevents both classic `../` traversal
 * and the subtle case where `/var/root` would falsely prefix-match `/var/rootevil`.
 */
export function assertSafePath(root: string, target: string): void {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);

  // Require that target equals root or starts with root + separator.
  // A plain startsWith check would allow "/rootevil" to pass when root is "/root".
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + "/")) {
    throw new WorkspaceError(
      `WorkspaceError: path traversal detected — "${target}" is outside workspace root "${root}"`,
    );
  }
}
