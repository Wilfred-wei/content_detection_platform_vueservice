import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AnalysisStore } from "../src/analysis-store.js";
import { FileObservability } from "../src/observability.js";
import { SessionStore } from "../src/session-store.js";
import { createStorageProtector, decodeStoragePayload, encodeStoragePayload } from "../src/storage-crypto.js";

const KEY = "0123456789abcdef".repeat(4);

test("round-trips an authenticated storage envelope and rejects wrong purpose or key", () => {
  const protector = createStorageProtector(KEY);
  const encoded = encodeStoragePayload(Buffer.from("secret"), protector, "test-record");
  assert.notEqual(encoded.toString("utf8"), "secret");
  assert.equal(decodeStoragePayload(encoded, protector, "test-record").toString("utf8"), "secret");
  assert.throws(() => decodeStoragePayload(encoded, protector, "other-record"), /STORAGE_DECRYPTION_FAILED/);
  assert.throws(() => decodeStoragePayload(encoded, createStorageProtector("f".repeat(64)), "test-record"), /STORAGE_DECRYPTION_FAILED/);
  assert.throws(() => decodeStoragePayload(encoded, undefined, "test-record"), /STORAGE_ENCRYPTION_KEY_REQUIRED/);
});

test("persists analysis state and observability as encrypted records", () => {
  const directory = mkdtempSync(join(tmpdir(), "storage-encryption-analysis-"));
  const protector = createStorageProtector(KEY);
  const store = new AnalysisStore(directory, protector);
  const assetPath = store.writeAsset("asset-1", Buffer.from("original-bytes"));
  assert.ok(readFileSync(assetPath, "utf8").includes("agent-storage-envelope.v1"));
  assert.equal(store.readAsset("asset-1").toString("utf8"), "original-bytes");
  const runtime = store.materializeAsset("asset-1");
  assert.equal(readFileSync(runtime.path, "utf8"), "original-bytes");
  runtime.cleanup();
  store.save({
    schemaVersion: "1.17.0",
    id: "analysis-encrypted",
    idempotencyKey: "private",
    directEvidencePolicyVersion: "direct-evidence-v1",
    state: "queued",
    stateVersion: 1,
    scope: "tenant-a",
    attempt: 1,
    retryHistory: [],
    options: { enableLocalization: false },
    asset: {
      schemaVersion: "1.17.0", id: "asset-1", filename: "x.png", mimeType: "image/png", sizeBytes: 1,
      sha256: "a".repeat(64), width: 1, height: 1, storedPath: "/tmp/asset", createdAt: new Date().toISOString(),
    },
    stages: [], executionPlan: [], progressEvents: [{ schemaVersion: "1.17.0", analysisId: "analysis-encrypted", sequence: 1, scope: "analysis", state: "queued", createdAt: new Date().toISOString() }],
    evidence: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  const persisted = readFileSync(join(directory, "analyses.json"), "utf8");
  assert.ok(persisted.includes("agent-storage-envelope.v1"));
  assert.ok(!persisted.includes("analysis-encrypted"));
  assert.equal(new AnalysisStore(directory, protector).get("analysis-encrypted")?.id, "analysis-encrypted");

  const observability = new FileObservability(directory, 10, protector);
  observability.record({ timestamp: new Date().toISOString(), type: "test.event", analysisId: "analysis-encrypted", durationMs: 10 });
  observability.record({ timestamp: new Date().toISOString(), type: "test.event", analysisId: "analysis-encrypted", durationMs: 30 });
  const eventLog = readFileSync(join(directory, "events.jsonl"), "utf8");
  assert.ok(eventLog.includes("agent-storage-envelope.v1"));
  assert.ok(!eventLog.includes("analysis-encrypted"));
  const restoredObservability = new FileObservability(directory, 10, protector).snapshot();
  assert.equal(restoredObservability.recentEvents[0]?.analysisId, "analysis-encrypted");
  assert.deepEqual(restoredObservability.timings["test.event"], { count: 2, p50Ms: 10, p95Ms: 30, maxMs: 30 });
});

test("encrypts persisted sessions without changing the public session contract", async () => {
  const directory = mkdtempSync(join(tmpdir(), "storage-encryption-session-"));
  const protector = createStorageProtector(KEY);
  const sessions = new SessionStore(async () => ({
    async prompt() { return "reply"; },
    async abort() {},
    dispose() {},
  }), 10, 10, directory, protector);
  const session = sessions.create();
  await sessions.send(session.id, "hello");
  const persisted = readFileSync(join(directory, "sessions.json"), "utf8");
  assert.ok(persisted.includes("agent-storage-envelope.v1"));
  assert.ok(!persisted.includes("hello"));
  assert.equal(new SessionStore(async () => { throw new Error("engine should not be needed"); }, 10, 10, directory, protector).get(session.id)?.messages[0]?.content, "hello");
});
