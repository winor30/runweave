import { describe, it, expect } from "vitest";
import { renderPrompt } from "../../src/engine/prompt.js";

describe("renderPrompt", () => {
  it("renders template variables from context", async () => {
    const result = await renderPrompt("Hello {{ name }}", { name: "world" });
    expect(result).toBe("Hello world");
  });

  it("renders multiple variables", async () => {
    const result = await renderPrompt("Fix issue #{{ number }} in {{ repo }}", {
      number: "42",
      repo: "owner/repo",
    });
    expect(result).toBe("Fix issue #42 in owner/repo");
  });

  it("throws on unknown variable in strict mode", async () => {
    await expect(renderPrompt("{{ unknown }}", {})).rejects.toThrow();
  });

  it("handles multiline templates", async () => {
    const template = `Line 1: {{ a }}\nLine 2: {{ b }}`;
    const result = await renderPrompt(template, { a: "A", b: "B" });
    expect(result).toBe("Line 1: A\nLine 2: B");
  });

  it("renders empty template without variables", async () => {
    const result = await renderPrompt("No variables here", {});
    expect(result).toBe("No variables here");
  });

  it("renders numeric string values correctly", async () => {
    const result = await renderPrompt("Count: {{ count }}", { count: "100" });
    expect(result).toBe("Count: 100");
  });

  it("renders template with repeated variable use", async () => {
    const result = await renderPrompt("{{ x }} + {{ x }} = twice", { x: "2" });
    expect(result).toBe("2 + 2 = twice");
  });

  it("throws on missing variable even when other variables are provided", async () => {
    await expect(
      renderPrompt("{{ present }} and {{ missing }}", { present: "ok" }),
    ).rejects.toThrow();
  });
});
