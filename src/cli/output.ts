/**
 * Formats an array of objects as an ASCII table.
 *
 * Column widths are computed from header + cell content so that the table
 * remains readable for both narrow and wide values without any dependency
 * on terminal width detection.
 */
export function formatTable(rows: Record<string, string>[], columns: string[]): string {
  if (rows.length === 0) {
    return "(no sessions)";
  }

  // Compute max width for each column (header vs. values)
  const widths = columns.map((col) => {
    const maxVal = rows.reduce((max, row) => Math.max(max, (row[col] ?? "").length), 0);
    return Math.max(col.length, maxVal);
  });

  const pad = (str: string, width: number): string => str.padEnd(width);

  const header = columns.map((col, i) => pad(col, widths[i]!)).join("  ");
  const separator = widths.map((w) => "-".repeat(w)).join("  ");
  const body = rows
    .map((row) => columns.map((col, i) => pad(row[col] ?? "", widths[i]!)).join("  "))
    .join("\n");

  return [header, separator, body].join("\n");
}

function formatToolInput(tool: string, input: Record<string, unknown>): string {
  if (tool === "Bash") {
    return typeof input["command"] === "string"
      ? input["command"]
      : JSON.stringify(input).slice(0, 60);
  }
  if (tool === "Read" || tool === "Glob") {
    const path = input["file_path"] ?? input["pattern"] ?? input["path"];
    return typeof path === "string" ? path : JSON.stringify(input).slice(0, 60);
  }
  if (tool === "Grep") {
    const pattern = input["pattern"] ?? input["path"];
    return typeof pattern === "string" ? pattern : JSON.stringify(input).slice(0, 60);
  }
  const raw = JSON.stringify(input);
  return raw.length > 60 ? raw.slice(0, 60) + "…" : raw;
}

/**
 * Formats a single session event for human-readable log output.
 *
 * The timestamp is shortened to HH:MM:SS for brevity; the type is
 * uppercased and padded to stand out visually. Per-type fields are
 * formatted to highlight the most relevant data for each event kind.
 */
export function formatEvent(event: Record<string, unknown>): string {
  const ts = typeof event["ts"] === "string" ? event["ts"].slice(11, 19) : "??:??:??";
  const type = typeof event["type"] === "string" ? event["type"] : "unknown";
  const label = type.toUpperCase();

  switch (type) {
    case "prompt": {
      const raw = typeof event["text"] === "string" ? event["text"] : "";
      const text = raw.length > 120 ? raw.slice(0, 120) + "…" : raw;
      return `[${ts}] ${label.padEnd(14)} ${text}`;
    }

    case "assistant_text": {
      const data = (event["data"] ?? {}) as Record<string, unknown>;
      const raw = typeof data["text"] === "string" ? data["text"] : "";
      const text = raw.length > 80 ? raw.slice(0, 80) + "…" : raw;
      return `[${ts}] ${label.padEnd(14)} text=${text}`;
    }

    case "tool_use": {
      const data = (event["data"] ?? {}) as Record<string, unknown>;
      const tool = typeof data["tool"] === "string" ? data["tool"] : "unknown";
      const input =
        data["input"] !== null && typeof data["input"] === "object"
          ? formatToolInput(tool, data["input"] as Record<string, unknown>)
          : String(data["input"] ?? "");
      return `[${ts}] ${label.padEnd(14)} tool=${tool} input=${input}`;
    }

    case "completed": {
      const data = (event["data"] ?? {}) as Record<string, unknown>;
      const parts: string[] = [];
      if (data["turns"] !== undefined) parts.push(`turns=${String(data["turns"])}`);
      if (data["cost_usd"] !== undefined) parts.push(`cost_usd=${String(data["cost_usd"])}`);
      if (typeof data["finalResponse"] === "string") {
        const fr = data["finalResponse"];
        parts.push(`response=${fr.length > 60 ? fr.slice(0, 60) + "…" : fr}`);
      }
      return parts.length > 0
        ? `[${ts}] ${label.padEnd(14)} ${parts.join(" ")}`
        : `[${ts}] ${label}`;
    }

    default: {
      const extras = Object.entries(event)
        .filter(([k]) => k !== "ts" && k !== "type")
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(" ");
      return extras ? `[${ts}] ${label.padEnd(14)} ${extras}` : `[${ts}] ${label}`;
    }
  }
}
