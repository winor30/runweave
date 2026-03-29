// tests/cli/output.test.ts
import { describe, it, expect } from "vitest";
import { formatEvent } from "../../src/cli/output.js";

describe("formatEvent", () => {
  const TS = "2024-01-15T14:30:45.000Z";

  it("formats timestamp as HH:MM:SS", () => {
    const result = formatEvent({ ts: TS, type: "started" });
    expect(result).toContain("[14:30:45]");
  });

  it("uses ??:??:?? when ts is missing", () => {
    const result = formatEvent({ type: "started" });
    expect(result).toContain("[??:??:??]");
  });

  it("formats prompt event with short text untruncated", () => {
    const result = formatEvent({
      ts: TS,
      type: "prompt",
      text: "Fix the bug",
    });
    expect(result).toContain("PROMPT");
    expect(result).toContain("Fix the bug");
    expect(result).not.toContain("…");
  });

  it("formats prompt event with text truncated at 120 chars", () => {
    const longText = "A".repeat(150);
    const result = formatEvent({ ts: TS, type: "prompt", text: longText });
    expect(result).toContain("PROMPT");
    expect(result).toContain("…");
    // output should contain the first 120 chars then ellipsis
    expect(result).toContain("A".repeat(120) + "…");
    expect(result).not.toContain("A".repeat(121));
  });

  it("formats assistant_text event with short text untruncated", () => {
    const result = formatEvent({
      ts: TS,
      type: "assistant_text",
      data: { text: "Short response" },
    });
    expect(result).toContain("ASSISTANT_TEXT");
    expect(result).toContain("text=Short response");
    expect(result).not.toContain("…");
  });

  it("formats assistant_text event with text truncated at 80 chars", () => {
    const longText = "B".repeat(100);
    const result = formatEvent({
      ts: TS,
      type: "assistant_text",
      data: { text: longText },
    });
    expect(result).toContain("ASSISTANT_TEXT");
    expect(result).toContain("B".repeat(80) + "…");
    expect(result).not.toContain("B".repeat(81));
  });

  it("formats tool_use event for Bash showing command field", () => {
    const result = formatEvent({
      ts: TS,
      type: "tool_use",
      data: { tool: "Bash", input: { command: "ls -la /tmp" } },
    });
    expect(result).toContain("TOOL_USE");
    expect(result).toContain("tool=Bash");
    expect(result).toContain("input=ls -la /tmp");
  });

  it("formats tool_use event for Read showing file_path field", () => {
    const result = formatEvent({
      ts: TS,
      type: "tool_use",
      data: { tool: "Read", input: { file_path: "/etc/hosts" } },
    });
    expect(result).toContain("tool=Read");
    expect(result).toContain("input=/etc/hosts");
  });

  it("formats tool_use event for Glob showing pattern field", () => {
    const result = formatEvent({
      ts: TS,
      type: "tool_use",
      data: { tool: "Glob", input: { pattern: "**/*.ts" } },
    });
    expect(result).toContain("tool=Glob");
    expect(result).toContain("input=**/*.ts");
  });

  it("formats tool_use event for Grep showing pattern field", () => {
    const result = formatEvent({
      ts: TS,
      type: "tool_use",
      data: { tool: "Grep", input: { pattern: "TODO" } },
    });
    expect(result).toContain("tool=Grep");
    expect(result).toContain("input=TODO");
  });

  it("formats tool_use event for unknown tools using JSON truncated to 60", () => {
    const input = { key: "value", another: "field" };
    const result = formatEvent({
      ts: TS,
      type: "tool_use",
      data: { tool: "CustomTool", input },
    });
    expect(result).toContain("tool=CustomTool");
    // JSON.stringify of the input should appear (possibly truncated)
    const raw = JSON.stringify(input);
    const expected = raw.length > 60 ? raw.slice(0, 60) + "…" : raw;
    expect(result).toContain(`input=${expected}`);
  });

  it("formats tool_use event for unknown tools truncates JSON at 60 chars", () => {
    // Build an input whose JSON serialization is >60 chars
    const input = { key: "a".repeat(60) };
    const result = formatEvent({
      ts: TS,
      type: "tool_use",
      data: { tool: "UnknownTool", input },
    });
    expect(result).toContain("…");
  });

  it("formats completed event with turns and cost_usd", () => {
    const result = formatEvent({
      ts: TS,
      type: "completed",
      data: { turns: 5, cost_usd: 0.025 },
    });
    expect(result).toContain("COMPLETED");
    expect(result).toContain("turns=5");
    expect(result).toContain("cost_usd=0.025");
  });

  it("formats completed event with no data fields", () => {
    const result = formatEvent({
      ts: TS,
      type: "completed",
      data: {},
    });
    expect(result).toContain("COMPLETED");
    // No extra key=value pairs
    expect(result).not.toContain("turns=");
    expect(result).not.toContain("cost_usd=");
  });

  it("formats started event using generic fallback", () => {
    const result = formatEvent({
      ts: TS,
      type: "started",
      workflow: "my-workflow",
    });
    expect(result).toContain("STARTED");
    expect(result).toContain("workflow=my-workflow");
  });

  it("formats completed event with finalResponse from Codex", () => {
    const result = formatEvent({
      ts: TS,
      type: "completed",
      data: { finalResponse: "all done" },
    });
    expect(result).toContain("COMPLETED");
    expect(result).toContain("response=all done");
  });

  it("truncates finalResponse in completed event at 60 chars", () => {
    const longResponse = "x".repeat(80);
    const result = formatEvent({
      ts: TS,
      type: "completed",
      data: { finalResponse: longResponse },
    });
    expect(result).toContain("response=" + "x".repeat(60) + "…");
  });
});
