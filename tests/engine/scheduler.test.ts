import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Scheduler } from "../../src/engine/scheduler.js";
import type { Executor } from "../../src/engine/executor.js";
import type { WorkflowConfig } from "../../src/shared/types.js";
import { createLogger } from "../../src/logging/logger.js";

function makeCronWorkflow(name: string, schedule = "0 9 * * *"): WorkflowConfig {
  return {
    name,
    trigger: { type: "cron", schedule },
    agent: { backend: "claude-code", mode: "autonomous", provider_options: {} },
    context: {},
    workspace: { root: "/tmp", hooks: {} },
    concurrency: { max: 1, on_conflict: "skip" },
    prompt: "Run",
  };
}

function makeManualWorkflow(name: string): WorkflowConfig {
  return {
    name,
    trigger: { type: "manual" },
    agent: { backend: "claude-code", mode: "autonomous", provider_options: {} },
    context: {},
    workspace: { root: "/tmp", hooks: {} },
    concurrency: { max: 1, on_conflict: "skip" },
    prompt: "Run",
  };
}

describe("Scheduler", () => {
  let mockExecutor: Executor;
  let scheduler: Scheduler;
  const logger = createLogger({ write: () => {} });

  beforeEach(() => {
    mockExecutor = { execute: vi.fn().mockResolvedValue(null) } as unknown as Executor;
    scheduler = new Scheduler(mockExecutor, logger);
  });

  afterEach(() => {
    scheduler.stopAll();
  });

  it("registers a cron workflow", () => {
    const wf = makeCronWorkflow("cron-test");
    scheduler.register(wf);
    expect(scheduler.getRegistered()).toContain("cron-test");
  });

  it("skips manual workflows — they are not cron-scheduled", () => {
    const wf = makeManualWorkflow("manual-test");
    scheduler.register(wf);
    expect(scheduler.getRegistered()).not.toContain("manual-test");
  });

  it("unregisters a workflow", () => {
    const wf = makeCronWorkflow("hot-reload-test");
    scheduler.register(wf);
    expect(scheduler.getRegistered()).toContain("hot-reload-test");

    scheduler.unregister("hot-reload-test");
    expect(scheduler.getRegistered()).not.toContain("hot-reload-test");
  });

  it("re-registers a workflow when called again (hot reload)", () => {
    const wf = makeCronWorkflow("reload-me", "0 9 * * *");
    scheduler.register(wf);
    // Re-register with a different schedule simulating hot reload
    const updated = makeCronWorkflow("reload-me", "0 10 * * *");
    scheduler.register(updated);

    // Should still be registered exactly once
    const registered = scheduler.getRegistered();
    expect(registered.filter((n) => n === "reload-me")).toHaveLength(1);
  });

  it("stopAll clears all registered jobs", () => {
    scheduler.register(makeCronWorkflow("wf-a"));
    scheduler.register(makeCronWorkflow("wf-b"));
    expect(scheduler.getRegistered()).toHaveLength(2);

    scheduler.stopAll();
    expect(scheduler.getRegistered()).toHaveLength(0);
  });

  it("unregistering a non-existent workflow is a no-op", () => {
    expect(() => scheduler.unregister("does-not-exist")).not.toThrow();
  });
});
