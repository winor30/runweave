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

/**
 * Formats a single session event for human-readable log output.
 *
 * The timestamp is shortened to HH:MM:SS for brevity; the type is
 * uppercased to stand out visually. Extra fields are appended as key=value
 * pairs so the output stays on one line per event.
 */
export function formatEvent(event: Record<string, unknown>): string {
  const ts = typeof event["ts"] === "string" ? event["ts"].slice(11, 19) : "??:??:??";
  const type = typeof event["type"] === "string" ? event["type"].toUpperCase() : "UNKNOWN";

  const extras = Object.entries(event)
    .filter(([k]) => k !== "ts" && k !== "type")
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");

  return extras ? `[${ts}] ${type}  ${extras}` : `[${ts}] ${type}`;
}
