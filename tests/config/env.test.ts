import { describe, it, expect, vi, afterEach } from "vitest";
import { expandEnvVars } from "../../src/config/env.js";

describe("expandEnvVars", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("expands $VAR_NAME in string values", () => {
    vi.stubEnv("MY_TOKEN", "secret123");
    expect(expandEnvVars("$MY_TOKEN")).toBe("secret123");
  });

  it("leaves non-variable strings unchanged", () => {
    expect(expandEnvVars("hello world")).toBe("hello world");
  });

  it("throws on undefined env var", () => {
    expect(() => expandEnvVars("$UNDEFINED_VAR")).toThrow("UNDEFINED_VAR");
  });

  it("expands env vars in nested objects", () => {
    vi.stubEnv("TOKEN", "abc");
    const input = { nested: { value: "$TOKEN" } };
    const result = expandEnvVars(input);
    expect(result).toEqual({ nested: { value: "abc" } });
  });

  it("expands env vars in arrays", () => {
    vi.stubEnv("ITEM", "val");
    const input = ["$ITEM", "literal"];
    const result = expandEnvVars(input);
    expect(result).toEqual(["val", "literal"]);
  });

  it("passes through non-string primitives", () => {
    expect(expandEnvVars(42)).toBe(42);
    expect(expandEnvVars(true)).toBe(true);
    expect(expandEnvVars(null)).toBe(null);
  });
});
