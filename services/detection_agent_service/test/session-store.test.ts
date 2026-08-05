import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ConversationEngine } from "../src/pi-engine.js";
import { SessionStore } from "../src/session-store.js";

function fakeEngine(reply: string): ConversationEngine {
  return { prompt: async () => reply, abort: async () => {}, dispose: () => {}, toolNames: () => [] };
}

test("keeps conversation histories isolated", async () => {
  const store = new SessionStore(async () => fakeEngine("ack"), 5, 10);
  const first = store.create();
  const second = store.create();

  await store.send(first.id, "hello");

  assert.equal(store.get(first.id)?.messages.length, 2);
  assert.equal(store.get(second.id)?.messages.length, 0);
  store.close();
});

test("bounds retained messages", async () => {
  const store = new SessionStore(async () => fakeEngine("ack"), 5, 2);
  const session = store.create();
  await store.send(session.id, "first");
  await store.send(session.id, "second");
  assert.equal(store.get(session.id)?.messages.length, 2);
  store.close();
});

test("reloads bounded sessions from filesystem without persisting engine state", async () => {
  const directory = mkdtempSync(join(tmpdir(), "agent-session-persistence-"));
  const first = new SessionStore(async () => fakeEngine("persisted"), 5, 10, directory);
  const session = first.create();
  await first.send(session.id, "hello");
  first.close();

  const second = new SessionStore(async () => fakeEngine("reloaded"), 5, 10, directory);
  assert.equal(second.get(session.id)?.messages.at(-1)?.content, "persisted");
  await second.send(session.id, "follow up");
  assert.equal(second.get(session.id)?.messages.at(-1)?.content, "reloaded");
  second.close(true);
});
