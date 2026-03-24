import { describe, it, expect } from "vitest";
import { ConfigError, SessionError, AgentError, WorkspaceError } from "../../src/shared/errors.js";

describe("custom errors", () => {
  it("ConfigError has correct name and message", () => {
    const err = new ConfigError("invalid yaml");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.name).toBe("ConfigError");
    expect(err.message).toBe("invalid yaml");
  });

  it("SessionError has correct name", () => {
    const err = new SessionError("not found");
    expect(err.name).toBe("SessionError");
  });

  it("AgentError has correct name", () => {
    const err = new AgentError("connection failed");
    expect(err.name).toBe("AgentError");
  });

  it("WorkspaceError has correct name", () => {
    const err = new WorkspaceError("path traversal");
    expect(err.name).toBe("WorkspaceError");
  });
});
