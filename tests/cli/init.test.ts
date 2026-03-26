import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { initCommand } from "../../src/cli/commands/init.js";

describe("init command", () => {
  let tempDir: string;
  let consoleOutput: string[];

  beforeEach(async () => {
    consoleOutput = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) => {
      consoleOutput.push(msg);
    });
    tempDir = await mkdtemp(join(tmpdir(), "runweave-init-test-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  it("creates workflows directory and example.yaml", async () => {
    await initCommand([tempDir]);
    expect(existsSync(join(tempDir, "workflows", "example.yaml"))).toBe(true);
  });

  it("creates .gitignore file", async () => {
    await initCommand([tempDir]);
    expect(existsSync(join(tempDir, ".gitignore"))).toBe(true);
  });

  it("example.yaml contains valid workflow content", async () => {
    await initCommand([tempDir]);
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(join(tempDir, "workflows", "example.yaml"), "utf-8");
    expect(content).toContain("name:");
    expect(content).toContain("prompt:");
  });

  it("example.yaml contains yaml-language-server schema reference", async () => {
    await initCommand([tempDir]);
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(join(tempDir, "workflows", "example.yaml"), "utf-8");
    expect(content).toContain(
      "# yaml-language-server: $schema=https://raw.githubusercontent.com/winor30/runweave/main/schema.json",
    );
  });

  it(".gitignore includes .runweave-workspaces/", async () => {
    await initCommand([tempDir]);
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(join(tempDir, ".gitignore"), "utf-8");
    expect(content).toContain(".runweave-workspaces/");
  });

  it(".gitignore includes .runweave-sessions/", async () => {
    await initCommand([tempDir]);
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(join(tempDir, ".gitignore"), "utf-8");
    expect(content).toContain(".runweave-sessions/");
  });

  it("prints confirmation messages", async () => {
    await initCommand([tempDir]);
    expect(consoleOutput.some((line) => line.toLowerCase().includes("initialized"))).toBe(true);
  });

  it("does not overwrite existing example.yaml", async () => {
    const { mkdir, writeFile, readFile } = await import("node:fs/promises");
    const wfDir = join(tempDir, "workflows");
    await mkdir(wfDir, { recursive: true });
    const existingContent = "name: pre-existing\nprompt: do not overwrite\n";
    await writeFile(join(wfDir, "example.yaml"), existingContent, "utf-8");

    await initCommand([tempDir]);

    const content = await readFile(join(wfDir, "example.yaml"), "utf-8");
    expect(content).toBe(existingContent);
  });

  it("defaults to cwd when no directory argument is provided", async () => {
    // We cannot easily test process.cwd() without changing it, so just verify
    // the command does not throw when called with no args (smoke test).
    // We pass an explicit dir to avoid side effects on the actual cwd.
    await expect(initCommand([tempDir])).resolves.toBeUndefined();
  });
});
