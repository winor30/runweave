import { readFile, readdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { parse as parseYaml } from "yaml";
import { workflowSchema, type WorkflowSchemaOutput } from "./schema.js";
import { expandEnvVars } from "./env.js";
import { ConfigError } from "../shared/errors.js";

/**
 * Reads a single YAML workflow file, expands environment variables,
 * and validates it against the workflow schema.
 *
 * Throws {@link ConfigError} for missing files, invalid YAML, or schema violations.
 */
export async function loadWorkflow(filePath: string): Promise<WorkflowSchemaOutput> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    throw new ConfigError(`Cannot read workflow file: ${filePath}`);
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new ConfigError(`Invalid YAML in ${filePath}: ${err}`);
  }

  const expanded = expandEnvVars(parsed);
  const result = workflowSchema.safeParse(expanded);

  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new ConfigError(`Validation failed for ${filePath}: ${issues}`);
  }

  return result.data;
}

/**
 * Loads all `.yaml` and `.yml` files from a directory.
 * Files that fail to parse or validate are collected in `errors` rather than
 * crashing the whole batch — callers decide how to handle partial failures.
 */
export async function loadAllWorkflows(dir: string): Promise<{
  workflows: WorkflowSchemaOutput[];
  errors: { file: string; error: Error }[];
}> {
  const entries = await readdir(dir);
  const yamlFiles = entries.filter((f) => [".yaml", ".yml"].includes(extname(f)));

  const workflows: WorkflowSchemaOutput[] = [];
  const errors: { file: string; error: Error }[] = [];

  for (const file of yamlFiles) {
    try {
      const wf = await loadWorkflow(resolve(dir, file));
      workflows.push(wf);
    } catch (err) {
      errors.push({ file, error: err instanceof Error ? err : new Error(String(err)) });
    }
  }

  return { workflows, errors };
}
