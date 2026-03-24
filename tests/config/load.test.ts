import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { loadWorkflow, loadAllWorkflows } from "../../src/config/load.js";
import { ConfigError } from "../../src/shared/errors.js";

const fixturesDir = resolve(import.meta.dirname, "../fixtures/workflows");

describe("loadWorkflow", () => {
  it("loads and validates a minimal workflow", async () => {
    const wf = await loadWorkflow(resolve(fixturesDir, "minimal.yaml"));
    expect(wf.name).toBe("minimal-test");
    expect(wf.trigger.type).toBe("manual");
    expect(wf.agent.backend).toBe("claude-code");
  });

  it("loads and validates a full workflow", async () => {
    const wf = await loadWorkflow(resolve(fixturesDir, "full.yaml"));
    expect(wf.name).toBe("full-test");
    expect(wf.trigger).toEqual({ type: "cron", schedule: "0 9 * * *" });
    expect(wf.agent.backend).toBe("codex");
    expect(wf.agent.mode).toBe("supervised");
  });

  it("throws ConfigError for invalid workflow", async () => {
    // Vitest's toThrow(string) checks error.message, not error.name.
    // Use instanceOf check to verify the correct error class is thrown.
    await expect(loadWorkflow(resolve(fixturesDir, "invalid.yaml"))).rejects.toBeInstanceOf(
      ConfigError,
    );
  });

  it("throws for non-existent file", async () => {
    await expect(loadWorkflow("/nonexistent.yaml")).rejects.toThrow();
  });
});

describe("loadAllWorkflows", () => {
  it("loads all valid workflows from directory", async () => {
    const { workflows, errors } = await loadAllWorkflows(fixturesDir);
    expect(workflows.length).toBeGreaterThanOrEqual(2);
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });
});
