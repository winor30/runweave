import { describe, it, expect } from "vitest";
import { assertSafePath } from "../../src/workspace/path-safety.js";

describe("assertSafePath", () => {
  it("allows simple subdirectory paths", () => {
    expect(() => assertSafePath("/root", "/root/sub")).not.toThrow();
  });

  it("rejects path traversal with ..", () => {
    expect(() => assertSafePath("/root", "/root/../etc/passwd")).toThrow("WorkspaceError");
  });

  it("rejects paths outside root", () => {
    expect(() => assertSafePath("/root", "/other/path")).toThrow("WorkspaceError");
  });

  it("handles trailing slashes", () => {
    expect(() => assertSafePath("/root/", "/root/sub/")).not.toThrow();
  });

  it("allows exact root path", () => {
    expect(() => assertSafePath("/root", "/root")).not.toThrow();
  });

  it("rejects symlink-style traversal attempts", () => {
    expect(() => assertSafePath("/var/root", "/var/rootevil")).toThrow("WorkspaceError");
  });
});
