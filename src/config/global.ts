import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { expandEnvVars } from "./env.js";
import { DEFAULT_SESSION } from "./defaults.js";

/**
 * Zod schema for ~/.runweave/config.yaml.
 *
 * All fields are optional — the file may not exist at all, in which case
 * defaults from DEFAULT_SESSION are used without error.
 */
const globalConfigSchema = z.object({
  session: z
    .object({
      ttl_days: z.number().default(DEFAULT_SESSION.ttl_days),
      max_runtime_ms: z.number().default(DEFAULT_SESSION.max_runtime_ms),
    })
    .default(DEFAULT_SESSION),
  notify: z
    .object({
      channels: z.array(z.any()).default([]),
      on: z
        .object({
          completed: z.boolean().default(true),
          failed: z.boolean().default(true),
          needs_input: z.boolean().default(true),
        })
        .default({ completed: true, failed: true, needs_input: true }),
    })
    .optional(),
});

export type GlobalConfig = z.infer<typeof globalConfigSchema>;

/**
 * Loads the user-level runweave configuration from `$HOME/.runweave/config.yaml`.
 *
 * If the file does not exist the schema defaults are returned silently.
 * Environment variable references (e.g. `$MY_VAR`) are expanded before
 * schema validation so secrets can stay out of the config file itself.
 *
 * @param homeDir - Absolute path to the user's home directory (allows injection in tests).
 */
export async function loadGlobalConfig(homeDir: string): Promise<GlobalConfig> {
  const configPath = join(homeDir, ".runweave", "config.yaml");
  if (!existsSync(configPath)) {
    return globalConfigSchema.parse({});
  }
  const raw = await readFile(configPath, "utf-8");
  const parsed = parseYaml(raw);
  const expanded = expandEnvVars(parsed);
  return globalConfigSchema.parse(expanded);
}
