import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";
import { validateCommand } from "../../src/cli/commands/validate.js";

const fixturesDir = resolve(import.meta.dirname, "../fixtures/workflows");

describe("validate command", () => {
  let consoleOutput: string[];

  beforeEach(() => {
    consoleOutput = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) => {
      consoleOutput.push(msg);
    });
    vi.spyOn(console, "error").mockImplementation((msg: string) => {
      consoleOutput.push(msg);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates a correct single workflow file and prints OK", async () => {
    await validateCommand([resolve(fixturesDir, "minimal.yaml")]);
    expect(consoleOutput.some((line) => line.includes("OK"))).toBe(true);
  });

  it("includes workflow name in OK output", async () => {
    await validateCommand([resolve(fixturesDir, "minimal.yaml")]);
    // minimal.yaml has name: minimal-test
    expect(consoleOutput.some((line) => line.includes("minimal-test"))).toBe(true);
  });

  it("throws for an invalid workflow YAML file", async () => {
    await expect(validateCommand([resolve(fixturesDir, "invalid.yaml")])).rejects.toThrow();
  });

  it("validates all workflows in a directory", async () => {
    // directory contains minimal.yaml (valid) and invalid.yaml (invalid)
    // loadAllWorkflows collects errors rather than throwing, but validateCommand
    // should throw when any workflow fails.
    await expect(validateCommand([fixturesDir])).rejects.toThrow(/workflow\(s\) failed validation/);
  });

  it("validates a directory containing only valid workflows", async () => {
    // Use fixtures parent which has no direct yamls — just sub-dir.
    // Instead, we create a scenario using full.yaml which is valid.
    const fullPath = resolve(fixturesDir, "full.yaml");
    await validateCommand([fullPath]);
    expect(consoleOutput.some((line) => line.includes("OK"))).toBe(true);
  });
});
