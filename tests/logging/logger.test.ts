import { describe, it, expect, beforeEach } from "vitest";
import { createLogger, type Logger } from "../../src/logging/logger.js";

describe("logger", () => {
  let output: string[];

  beforeEach(() => {
    output = [];
  });

  function createTestLogger(): Logger {
    return createLogger({
      write: (line: string) => output.push(line),
    });
  }

  it("logs info with structured JSON", () => {
    const logger = createTestLogger();
    logger.info("server started", { port: 3000 });
    expect(output).toHaveLength(1);
    const parsed = JSON.parse(output[0]);
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("server started");
    expect(parsed.port).toBe(3000);
    expect(parsed.ts).toBeDefined();
  });

  it("logs warn level", () => {
    const logger = createTestLogger();
    logger.warn("deprecation notice");
    const parsed = JSON.parse(output[0]);
    expect(parsed.level).toBe("warn");
  });

  it("logs error with error object", () => {
    const logger = createTestLogger();
    logger.error("failed", { error: new Error("boom") });
    const parsed = JSON.parse(output[0]);
    expect(parsed.level).toBe("error");
    expect(parsed.error).toBe("boom");
  });

  it("creates child logger with bound context", () => {
    const logger = createTestLogger();
    const child = logger.child({ workflow: "fix-issues" });
    child.info("started");
    const parsed = JSON.parse(output[0]);
    expect(parsed.workflow).toBe("fix-issues");
    expect(parsed.msg).toBe("started");
  });
});
