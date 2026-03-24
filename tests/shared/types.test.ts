import { describe, it, expect } from "vitest";
import { SESSION_STATUSES, AGENT_MODES, AGENT_BACKENDS } from "../../src/shared/types.js";

describe("shared types", () => {
  it("SESSION_STATUSES contains all valid statuses", () => {
    expect(SESSION_STATUSES).toContain("pending");
    expect(SESSION_STATUSES).toContain("running");
    expect(SESSION_STATUSES).toContain("completed");
    expect(SESSION_STATUSES).toContain("failed");
    expect(SESSION_STATUSES).toContain("needs_input");
    expect(SESSION_STATUSES).toContain("timed_out");
    expect(SESSION_STATUSES).toHaveLength(6);
  });

  it("AGENT_MODES contains all valid modes", () => {
    expect(AGENT_MODES).toContain("autonomous");
    expect(AGENT_MODES).toContain("full-auto");
    expect(AGENT_MODES).toContain("supervised");
    expect(AGENT_MODES).toContain("readonly");
    expect(AGENT_MODES).toHaveLength(4);
  });

  it("AGENT_BACKENDS contains supported backends", () => {
    expect(AGENT_BACKENDS).toContain("claude-code");
    expect(AGENT_BACKENDS).toContain("codex");
    expect(AGENT_BACKENDS).toHaveLength(2);
  });
});
