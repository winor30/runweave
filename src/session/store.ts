import { mkdir, readFile, writeFile, readdir, appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import type { SessionMetadata, SessionEvent } from "./types.js";
import type { SessionStatus } from "../shared/types.js";
import { SessionError } from "../shared/errors.js";

/**
 * Flat-file session store.
 *
 * Layout inside `baseDir`:
 *   <baseDir>/
 *     <session_id>/
 *       metadata        — key=value lines, one field per line
 *       events.jsonl    — one JSON object per line, append-only
 *
 * We use the simple `key=value` text format instead of JSON for the metadata
 * file so that the file remains readable and patchable with standard Unix tools
 * without a JSON parser. Values that contain `=` are handled correctly because
 * `indexOf('=')` finds only the *first* `=` on each line.
 */
const REQUIRED_METADATA_KEYS = ["session_id", "status", "workflow", "agent_backend"] as const;

export class SessionStore {
  constructor(private readonly baseDir: string) {}

  /** Validates sessionId and returns the resolved directory path. */
  private safeSessionDir(sessionId: string): string {
    if (/[/\\]|\.\./.test(sessionId)) {
      throw new SessionError(`Unsafe session ID: ${sessionId}`);
    }
    const dir = join(this.baseDir, sessionId);
    const resolvedBase = resolve(this.baseDir);
    const resolvedDir = resolve(dir);
    if (!resolvedDir.startsWith(resolvedBase + "/") && resolvedDir !== resolvedBase) {
      throw new SessionError(`Path traversal detected: ${sessionId}`);
    }
    return dir;
  }

  private sessionDir(sessionId: string): string {
    return this.safeSessionDir(sessionId);
  }

  private metadataPath(sessionId: string): string {
    return join(this.sessionDir(sessionId), "metadata");
  }

  private eventsPath(sessionId: string): string {
    return join(this.sessionDir(sessionId), "events.jsonl");
  }

  /** Persists (or overwrites) metadata for a session. */
  async save(meta: SessionMetadata): Promise<void> {
    const dir = this.sessionDir(meta.session_id);
    await mkdir(dir, { recursive: true });
    const lines = Object.entries(meta)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    await writeFile(this.metadataPath(meta.session_id), lines + "\n", "utf-8");
  }

  /** Returns the metadata for `sessionId`, or `null` if it does not exist. */
  async read(sessionId: string): Promise<SessionMetadata | null> {
    const path = this.metadataPath(sessionId);
    if (!existsSync(path)) return null;
    const content = await readFile(path, "utf-8");
    const entries: Record<string, string> = {};
    for (const line of content.trim().split("\n")) {
      // Use indexOf so that values containing `=` are captured in full.
      const idx = line.indexOf("=");
      if (idx > 0) {
        entries[line.slice(0, idx)] = line.slice(idx + 1);
      }
    }
    // Validate required fields exist
    for (const key of REQUIRED_METADATA_KEYS) {
      if (!entries[key]) {
        return null; // Treat corrupted metadata as missing
      }
    }
    return entries as unknown as SessionMetadata;
  }

  /** Updates only the `status` field without rewriting the full metadata. */
  async updateStatus(sessionId: string, status: SessionStatus): Promise<void> {
    const meta = await this.read(sessionId);
    if (!meta) return;
    meta.status = status;
    await this.save(meta);
  }

  /** Returns metadata for every session directory found in `baseDir`. */
  async list(): Promise<SessionMetadata[]> {
    if (!existsSync(this.baseDir)) return [];
    const entries = await readdir(this.baseDir, { withFileTypes: true });
    const results: SessionMetadata[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const meta = await this.read(entry.name);
        if (meta) results.push(meta);
      }
    }
    return results;
  }

  /** Returns all sessions whose `workflow` field matches the given name. */
  async findByWorkflow(workflow: string): Promise<SessionMetadata[]> {
    const all = await this.list();
    return all.filter((m) => m.workflow === workflow);
  }

  /**
   * Appends a single event line to `events.jsonl`.
   *
   * The directory is created on first append so that events can be recorded
   * even before `save()` has been called (e.g. for early diagnostic events).
   */
  async appendEvent(sessionId: string, event: SessionEvent): Promise<void> {
    const dir = this.sessionDir(sessionId);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await appendFile(this.eventsPath(sessionId), JSON.stringify(event) + "\n", "utf-8");
  }

  /** Returns all events for `sessionId`, or an empty array if none exist. */
  async readEvents(sessionId: string): Promise<SessionEvent[]> {
    const path = this.eventsPath(sessionId);
    if (!existsSync(path)) return [];
    const content = await readFile(path, "utf-8");
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SessionEvent);
  }
}
