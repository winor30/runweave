import { describe, it, expect } from "vitest";
import { workflowSchema } from "../../src/config/schema.js";

describe("workflowSchema", () => {
  it("parses minimal workflow config", () => {
    const result = workflowSchema.safeParse({
      name: "test",
      prompt: "do something",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.trigger.type).toBe("manual");
      expect(result.data.agent.backend).toBe("claude-code");
      expect(result.data.agent.mode).toBe("autonomous");
      expect(result.data.workspace.root).toBe(".runweave-workspaces");
      expect(result.data.concurrency.max).toBe(1);
    }
  });

  it("parses cron shorthand trigger", () => {
    const result = workflowSchema.safeParse({
      name: "cron-test",
      trigger: { cron: "0 9 * * *" },
      prompt: "run",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.trigger).toEqual({ type: "cron", schedule: "0 9 * * *" });
    }
  });

  it("parses full workflow config", () => {
    const result = workflowSchema.safeParse({
      name: "full",
      description: "Full config",
      trigger: { type: "cron", schedule: "0 9 * * *" },
      agent: {
        backend: "codex",
        mode: "supervised",
        model: "gpt-4",
        provider_options: { sandbox: "workspace-write" },
      },
      context: { repo: "owner/repo" },
      workspace: {
        root: "/tmp/ws",
        hooks: { after_create: "git clone .", before_run: "git pull" },
      },
      concurrency: { max: 3, on_conflict: "queue" },
      prompt: "fix it",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = workflowSchema.safeParse({ prompt: "test" });
    expect(result.success).toBe(false);
  });

  it("rejects missing prompt", () => {
    const result = workflowSchema.safeParse({ name: "test" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid agent backend", () => {
    const result = workflowSchema.safeParse({
      name: "test",
      prompt: "test",
      agent: { backend: "invalid" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid agent mode", () => {
    const result = workflowSchema.safeParse({
      name: "test",
      prompt: "test",
      agent: { mode: "invalid" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts effort values supported by claude-code backend", () => {
    const levels = ["low", "medium", "high", "max"] as const;
    for (const effort of levels) {
      const result = workflowSchema.safeParse({
        name: "test",
        prompt: "test",
        agent: { backend: "claude-code", effort },
      });
      expect(result.success, `claude-code effort '${effort}' should be valid`).toBe(true);
      if (result.success) {
        expect(result.data.agent.effort).toBe(effort);
      }
    }
  });

  it("accepts effort values supported by codex backend", () => {
    const levels = ["minimal", "low", "medium", "high", "xhigh"] as const;
    for (const effort of levels) {
      const result = workflowSchema.safeParse({
        name: "test",
        prompt: "test",
        agent: { backend: "codex", effort },
      });
      expect(result.success, `codex effort '${effort}' should be valid`).toBe(true);
      if (result.success) {
        expect(result.data.agent.effort).toBe(effort);
      }
    }
  });

  it("rejects Codex-only effort values for claude-code backend", () => {
    for (const effort of ["minimal", "xhigh"] as const) {
      const result = workflowSchema.safeParse({
        name: "test",
        prompt: "test",
        agent: { backend: "claude-code", effort },
      });
      expect(result.success, `claude-code should reject effort '${effort}'`).toBe(false);
    }
  });

  it("rejects Claude-only effort values for codex backend", () => {
    const result = workflowSchema.safeParse({
      name: "test",
      prompt: "test",
      agent: { backend: "codex", effort: "max" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid effort level", () => {
    const result = workflowSchema.safeParse({
      name: "test",
      prompt: "test",
      agent: { effort: "ultra" },
    });
    expect(result.success).toBe(false);
  });

  it("defaults effort to undefined when omitted", () => {
    const result = workflowSchema.safeParse({ name: "test", prompt: "test" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agent.effort).toBeUndefined();
    }
  });
});
