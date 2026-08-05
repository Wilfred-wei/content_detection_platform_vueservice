import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PersistentAnalysisQueue } from "../src/analysis-queue.js";

function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() >= deadline) return reject(new Error("condition timed out"));
      setTimeout(check, 5);
    };
    check();
  });
}

test("persists queued work, enforces concurrency, and drains with at-least-once leases", async () => {
  const directory = mkdtempSync(join(tmpdir(), "analysis-queue-"));
  const queue = new PersistentAnalysisQueue(directory, { maxQueue: 4, concurrency: 1, leaseMs: 500, maxAgeMs: 5_000 });
  let active = 0;
  let maximumActive = 0;
  const completed: string[] = [];
  queue.start(async (id) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
    completed.push(id);
  }, () => {});
  queue.enqueue("first", "tenant-a");
  queue.enqueue("second", "tenant-b");
  assert.equal(JSON.parse(readFileSync(join(directory, "queue.json"), "utf8")).jobs.length, 2);
  await waitFor(() => completed.length === 2);
  assert.equal(maximumActive, 1);
  assert.equal(queue.stats().running, 0);
  assert.equal(queue.stats().queued, 0);
  queue.close();
});

test("rejects overload and expires stale jobs with a typed callback", async () => {
  const directory = mkdtempSync(join(tmpdir(), "analysis-queue-overload-"));
  const queue = new PersistentAnalysisQueue(directory, { maxQueue: 2, concurrency: 1, leaseMs: 500, maxAgeMs: 25 });
  const expired: string[] = [];
  queue.start(async () => { await new Promise((resolve) => setTimeout(resolve, 100)); }, (id) => expired.push(id));
  queue.enqueue("held");
  queue.enqueue("stale");
  assert.throws(() => queue.enqueue("overloaded"), /ANALYSIS_QUEUE_OVERLOADED/);
  await waitFor(() => expired.includes("stale"), 1_000);
  assert.equal(queue.stats().expiredJobs, 1);
  queue.close();
});

test("recovers a lease left by a crashed process", async () => {
  const directory = mkdtempSync(join(tmpdir(), "analysis-queue-recovery-"));
  const first = new PersistentAnalysisQueue(directory, { maxQueue: 2, concurrency: 1, leaseMs: 20, maxAgeMs: 5_000 });
  first.start(async () => { await new Promise(() => {}); }, () => {});
  first.enqueue("crashed");
  await waitFor(() => first.stats().running === 1);
  first.close();
  await new Promise((resolve) => setTimeout(resolve, 30));

  const recovered: string[] = [];
  const second = new PersistentAnalysisQueue(directory, { maxQueue: 2, concurrency: 1, leaseMs: 500, maxAgeMs: 5_000 });
  second.start(async (id) => recovered.push(id), () => {});
  await waitFor(() => recovered.includes("crashed"));
  assert.equal(second.stats().recoveredLeases, 1);
  second.close();
});

test("removes a queued job without affecting an active lease", async () => {
  const directory = mkdtempSync(join(tmpdir(), "analysis-queue-cancel-"));
  const queue = new PersistentAnalysisQueue(directory, { maxQueue: 4, concurrency: 1, leaseMs: 500, maxAgeMs: 5_000 });
  const started: string[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  queue.start(async (id) => {
    started.push(id);
    if (id === "held") await held;
  }, () => {});
  queue.enqueue("held");
  queue.enqueue("cancelled");
  await waitFor(() => started.includes("held"));
  assert.equal(queue.cancel("cancelled"), true);
  assert.equal(queue.cancel("cancelled"), false);
  assert.equal(queue.stats().running, 1);
  release();
  await waitFor(() => queue.stats().running === 0);
  assert.deepEqual(started, ["held"]);
  queue.close();
});

test("uses configured scope weights while retaining a bounded fair schedule", async () => {
  const directory = mkdtempSync(join(tmpdir(), "analysis-queue-weighted-"));
  const queue = new PersistentAnalysisQueue(directory, { maxQueue: 8, concurrency: 1, leaseMs: 500, maxAgeMs: 5_000, scopeWeights: { premium: 3, standard: 1 } });
  const completed: string[] = [];
  queue.start(async (id) => { completed.push(id); }, () => {});
  for (const id of ["p1", "s1", "p2", "s2", "p3", "s3", "p4", "s4"]) {
    queue.enqueue(id, id.startsWith("p") ? "premium" : "standard");
  }
  await waitFor(() => completed.length === 8);
  assert.equal(completed[0], "p1");
  assert.ok(completed.slice(0, 5).filter((id) => id.startsWith("p")).length >= 3);
  assert.ok(completed.includes("s1"));
  queue.close();
});
