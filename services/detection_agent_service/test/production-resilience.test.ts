import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PersistentAnalysisQueue } from "../src/analysis-queue.js";
import { decideProvenanceFirst } from "../src/decision-policy.js";
import { ANALYSIS_SCHEMA_VERSION, type EvidenceRecord } from "../src/analysis-types.js";

function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() >= deadline) return reject(new Error("resilience condition timed out"));
      setTimeout(check, 5);
    };
    check();
  });
}

test("bounded concurrent load preserves backpressure, concurrency, and completion", async () => {
  const directory = mkdtempSync(join(tmpdir(), "production-load-"));
  const queue = new PersistentAnalysisQueue(directory, { maxQueue: 24, concurrency: 4, leaseMs: 1_000, maxAgeMs: 10_000, scopeWeights: { premium: 2, standard: 1 } });
  let active = 0;
  let maximumActive = 0;
  const completed = new Set<string>();
  queue.start(async (id) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 3));
    completed.add(id);
    active -= 1;
  }, () => {});
  for (let index = 0; index < 24; index += 1) queue.enqueue(`load-${index}`, index % 3 === 0 ? "premium" : "standard");
  assert.throws(() => queue.enqueue("overload"), /ANALYSIS_QUEUE_OVERLOADED/);
  await waitFor(() => completed.size === 24);
  assert.ok(maximumActive > 1);
  assert.ok(maximumActive <= 4);
  assert.equal(queue.stats().queued, 0);
  assert.equal(queue.stats().running, 0);
  queue.close();
});

test("duplicate delivery and late completion remain idempotent", async () => {
  const directory = mkdtempSync(join(tmpdir(), "production-duplicate-"));
  const queue = new PersistentAnalysisQueue(directory, { maxQueue: 4, concurrency: 1, leaseMs: 1_000, maxAgeMs: 10_000 });
  let executions = 0;
  queue.start(async () => {
    executions += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }, () => {});
  queue.enqueue("same-analysis");
  queue.enqueue("same-analysis");
  await waitFor(() => queue.stats().running === 0 && queue.stats().queued === 0);
  assert.equal(executions, 1);
  queue.close();
});

test("decision output is invariant under concurrent evidence ordering", async () => {
  const evidence = (id: string, aiOrigin: boolean): EvidenceRecord => ({
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    id,
    analysisId: "load-analysis",
    category: "provenance",
    source: id,
    status: "verified_present",
    strength: "strong",
    summary: "controlled fixture",
    facts: { provenanceVerified: true, aiOrigin },
    createdAt: "2026-08-04T00:00:00.000Z",
  });
  const records = [evidence("trusted-ai", true)];
  const decisions = await Promise.all(Array.from({ length: 100 }, async () => decideProvenanceFirst(structuredClone(records), "2026-08-04T00:00:00.000Z")));
  for (const decision of decisions) assert.deepEqual(decision, decisions[0]);
  assert.equal(decisions[0]?.verdict, "AI_GENERATED");
});
