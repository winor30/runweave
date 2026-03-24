import { ConfigError } from "../shared/errors.js";

/**
 * Recursively expands $VAR_NAME references in a value using process.env.
 * Only exact matches of the pattern `$[A-Z_][A-Z0-9_]*` are expanded.
 * Partial substitutions within a larger string are intentionally not supported
 * to keep the surface area minimal and predictable.
 */
export function expandEnvVars<T>(value: T): T {
  if (typeof value === "string") {
    if (/^\$[A-Z_][A-Z0-9_]*$/.test(value)) {
      const varName = value.slice(1);
      const envValue = process.env[varName];
      if (envValue === undefined) {
        throw new ConfigError(`Environment variable ${varName} is not set`);
      }
      return envValue as T;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => expandEnvVars(item)) as T;
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = expandEnvVars(val);
    }
    return result as T;
  }

  return value;
}
