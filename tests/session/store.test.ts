import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../../src/session/store.js";
import type { SessionMetadata } from "../../src/session/types.js";

describe("SessionStore", () => {
  let tempDir: string;
  let store: SessionStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "runweave-session-test-"));
    store = new SessionStore(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const makeMetadata = (overrides?: Partial<SessionMetadata>): SessionMetadata => ({
    workflow: "test-wf",
    session_id: "sess-001",
    status: "running",
    agent_backend: "claude-code",
    agent_session_id: "agent-abc",
    workspace: "/tmp/ws/sess-001",
    started_at: "2026-03-24T09:00:00Z",
    prompt_hash: "abc123",
    ...overrides,
  });

  it("saves and reads metadata", async () => {
    const meta = makeMetadata();
    await store.save(meta);
    const loaded = await store.read("sess-001");
    expect(loaded).toEqual(meta);
  });

  it("updates status", async () => {
    await store.save(makeMetadata());
    await store.updateStatus("sess-001", "completed");
    const loaded = await store.read("sess-001");
    expect(loaded?.status).toBe("completed");
  });

  it("lists all sessions", async () => {
    await store.save(makeMetadata({ session_id: "sess-001" }));
    await store.save(makeMetadata({ session_id: "sess-002", workflow: "other" }));
    const all = await store.list();
    expect(all).toHaveLength(2);
  });

  it("finds sessions by workflow", async () => {
    await store.save(makeMetadata({ session_id: "s1", workflow: "wf-a" }));
    await store.save(makeMetadata({ session_id: "s2", workflow: "wf-b" }));
    const found = await store.findByWorkflow("wf-a");
    expect(found).toHaveLength(1);
    expect(found[0]!.workflow).toBe("wf-a");
  });

  it("appends and reads events", async () => {
    await store.save(makeMetadata());
    await store.appendEvent("sess-001", { ts: "2026-03-24T09:00:00Z", type: "started" });
    await store.appendEvent("sess-001", { ts: "2026-03-24T09:01:00Z", type: "completed" });
    const events = await store.readEvents("sess-001");
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe("started");
  });

  it("returns null for non-existent session", async () => {
    const loaded = await store.read("nonexistent");
    expect(loaded).toBeNull();
  });

  it("returns empty array for events of non-existent session", async () => {
    const events = await store.readEvents("nonexistent");
    expect(events).toEqual([]);
  });

  it("returns empty list when no sessions exist", async () => {
    const all = await store.list();
    expect(all).toEqual([]);
  });

  it("overwrites metadata on repeated save", async () => {
    await store.save(makeMetadata({ status: "running" }));
    await store.save(makeMetadata({ status: "completed" }));
    const loaded = await store.read("sess-001");
    expect(loaded?.status).toBe("completed");
  });

  it("preserves all metadata fields through save/read roundtrip", async () => {
    const meta = makeMetadata({
      session_id: "roundtrip-001",
      workflow: "my-workflow",
      status: "needs_input",
      agent_backend: "codex",
      agent_session_id: "codex-session-xyz",
      workspace: "/workspaces/roundtrip-001",
      started_at: "2026-03-24T12:00:00Z",
      prompt_hash: "deadbeef",
    });
    await store.save(meta);
    const loaded = await store.read("roundtrip-001");
    expect(loaded).toEqual(meta);
  });
});
