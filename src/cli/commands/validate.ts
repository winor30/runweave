import { resolve } from "node:path";
import { loadWorkflow, loadAllWorkflows } from "../../config/load.js";

/**
 * Validates one or more workflow YAML files.
 *
 * - Single file: validates and prints "OK: <name> (<path>)"
 * - Directory: validates all .yaml/.yml files, prints OK/FAIL per file,
 *   and throws when any file fails so the process exits non-zero.
 */
export async function validateCommand(args: string[]): Promise<void> {
  const target = args[0] ?? "workflows";
  const targetPath = resolve(target);

  if (targetPath.endsWith(".yaml") || targetPath.endsWith(".yml")) {
    const wf = await loadWorkflow(targetPath);
    console.log(`OK: ${wf.name} (${targetPath})`);
  } else {
    const { workflows, errors } = await loadAllWorkflows(targetPath);

    for (const wf of workflows) {
      console.log(`OK: ${wf.name}`);
    }

    for (const { file, error } of errors) {
      console.error(`FAIL: ${file} — ${error.message}`);
    }

    if (errors.length > 0) {
      throw new Error(`${errors.length} workflow(s) failed validation`);
    }
  }
}
