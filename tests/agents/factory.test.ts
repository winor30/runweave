// tests/agents/factory.test.ts
import { describe, it, expect } from "vitest";
import { createAgentBackend } from "../../src/agents/factory.js";

describe("createAgentBackend", () => {
  it("creates claude-code backend", () => {
    const backend = createAgentBackend("claude-code");
    expect(backend.provider).toBe("claude-code");
  });

  it("creates codex backend", () => {
    const backend = createAgentBackend("codex");
    expect(backend.provider).toBe("codex");
  });

  it("throws for unknown backend", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => createAgentBackend("unknown" as any)).toThrow();
  });
});
