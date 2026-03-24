import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { WorkspaceManager } from "../../src/workspace/manager.js";

describe("WorkspaceManager", () => {
  let tempDir: string;
  let manager: WorkspaceManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "runweave-ws-test-"));
    manager = new WorkspaceManager(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates workspace directory for a session", async () => {
    const wsPath = await manager.ensure("session-123");
    expect(existsSync(wsPath)).toBe(true);
    expect(wsPath).toContain("session-123");
  });

  it("returns existing workspace on second call", async () => {
    const first = await manager.ensure("session-123");
    const second = await manager.ensure("session-123");
    expect(first).toBe(second);
  });

  it("rejects unsafe session ids", async () => {
    await expect(manager.ensure("../../../etc")).rejects.toThrow("WorkspaceError");
  });

  it("rejects session ids with backslash", async () => {
    await expect(manager.ensure("foo\\bar")).rejects.toThrow("WorkspaceError");
  });

  it("creates workspace inside the root directory", async () => {
    const wsPath = await manager.ensure("my-session");
    expect(wsPath.startsWith(tempDir)).toBe(true);
  });

  it("creates distinct workspaces for different session IDs", async () => {
    const ws1 = await manager.ensure("session-a");
    const ws2 = await manager.ensure("session-b");
    expect(ws1).not.toBe(ws2);
    expect(existsSync(ws1)).toBe(true);
    expect(existsSync(ws2)).toBe(true);
  });
});
