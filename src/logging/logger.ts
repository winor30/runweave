export interface LogSink {
  write(line: string): void;
}

export interface Logger {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  debug(msg: string, ctx?: Record<string, unknown>): void;
  child(defaultCtx: Record<string, unknown>): Logger;
}

const defaultSink: LogSink = {
  write: (line: string) => process.stderr.write(line + "\n"),
};

export function createLogger(
  sink: LogSink = defaultSink,
  defaultCtx: Record<string, unknown> = {},
): Logger {
  function log(level: string, msg: string, ctx?: Record<string, unknown>): void {
    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...defaultCtx,
    };
    if (ctx) {
      for (const [key, value] of Object.entries(ctx)) {
        if (value instanceof Error) {
          entry[key] = value.message;
        } else {
          entry[key] = value;
        }
      }
    }
    sink.write(JSON.stringify(entry));
  }

  return {
    info: (msg, ctx) => log("info", msg, ctx),
    warn: (msg, ctx) => log("warn", msg, ctx),
    error: (msg, ctx) => log("error", msg, ctx),
    debug: (msg, ctx) => log("debug", msg, ctx),
    child: (childCtx) => createLogger(sink, { ...defaultCtx, ...childCtx }),
  };
}
