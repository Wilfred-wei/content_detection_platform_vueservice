import assert from "node:assert/strict";
import test from "node:test";

import { ModelResourceScheduler, parseModelResourceProfile } from "../src/model-resource-scheduler.js";

const profile = parseModelResourceProfile({
  modelId: "dda",
  device: "cuda:0",
  resourceClass: "gpu",
  memoryReservationMb: 100,
  slots: 1,
  maxQueue: 2,
  microbatchSize: 1,
  maxBatchDelayMs: 10,
});

test("reserves declared memory and slot capacity before running a model task", async () => {
  const scheduler = new ModelResourceScheduler([{ device: "cuda:0", memoryMb: 100, slots: 1 }]);
  scheduler.register(profile);
  let release!: () => void;
  const first = scheduler.run("dda", () => new Promise<string>((resolve) => { release = () => resolve("first"); }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = scheduler.run("dda", async () => "second");
  assert.equal(scheduler.stats()[0].active, 1);
  assert.equal(scheduler.stats()[0].queued, 1);
  release();
  assert.equal(await first, "first");
  assert.equal(await second, "second");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(scheduler.stats()[0].reservedMemoryMb, 0);
});

test("rejects beyond the per-model queue bound and reports unavailable capacity", async () => {
  const scheduler = new ModelResourceScheduler([{ device: "cuda:0", memoryMb: 100, slots: 1 }]);
  scheduler.register({ ...profile, maxQueue: 1 });
  let release!: () => void;
  const first = scheduler.run("dda", () => new Promise<void>((resolve) => { release = resolve; }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  await assert.rejects(scheduler.run("dda", async () => undefined), /MODEL_RESOURCE_QUEUE_FULL/);
  release();
  await first;
});

test("blocks a job when declared memory cannot fit the device", async () => {
  const scheduler = new ModelResourceScheduler([{ device: "cuda:0", memoryMb: 99, slots: 1 }]);
  scheduler.register(profile);
  const pending = scheduler.run("dda", async () => "never");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(scheduler.stats()[0].active, 0);
  assert.equal(scheduler.stats()[0].queued, 1);
  scheduler.close();
  await assert.rejects(pending, /MODEL_RESOURCE_SCHEDULER_CLOSED/);
});

test("shares slot and memory admission across models on the same device", async () => {
  const scheduler = new ModelResourceScheduler([{ device: "cuda:0", memoryMb: 300, slots: 2 }]);
  scheduler.register({ ...profile, modelId: "dda-primary", memoryReservationMb: 200, slots: 2, maxQueue: 2 });
  scheduler.register({ ...profile, modelId: "safe-complementary", memoryReservationMb: 200, slots: 2, maxQueue: 2 });
  let release!: () => void;
  const first = scheduler.run("dda-primary", () => new Promise<string>((resolve) => { release = () => resolve("primary"); }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = scheduler.run("safe-complementary", async () => "must-wait");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(scheduler.deviceStats()[0]?.active, 1);
  assert.equal(scheduler.deviceStats()[0]?.reservedMemoryMb, 200);
  assert.equal(scheduler.stats().find((item) => item.modelId === "safe-complementary")?.queued, 1);
  release();
  assert.equal(await first, "primary");
  assert.equal(await second, "must-wait");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(scheduler.deviceStats()[0]?.reservedMemoryMb, 0);
});

test("does not guess memory use when a known device has a memory budget", async () => {
  const scheduler = new ModelResourceScheduler([{ device: "cuda:0", memoryMb: 2_000, slots: 1 }]);
  scheduler.register({ ...profile, modelId: "unknown-memory", memoryReservationMb: null });
  const pending = scheduler.run("unknown-memory", async () => "never");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(scheduler.deviceStats()[0]?.active, 0);
  assert.equal(scheduler.stats()[0]?.queued, 1);
  scheduler.close();
  await assert.rejects(pending, /MODEL_RESOURCE_SCHEDULER_CLOSED/);
});

test("bounds worker micro-batches and rejects misaligned batch output", async () => {
  const scheduler = new ModelResourceScheduler();
  scheduler.register({ ...profile, maxQueue: 8, microbatchSize: 2 });
  const seen: number[] = [];
  const output = await scheduler.runBatch("dda", [
    async () => 1,
    async () => 2,
    async () => 3,
    async () => 4,
    async () => 5,
  ], async (tasks) => {
    assert.ok(tasks.length <= 2);
    seen.push(tasks.length);
    return Promise.all(tasks.map((task) => task()));
  });
  assert.deepEqual(output, [1, 2, 3, 4, 5]);
  assert.deepEqual(seen, [2, 2, 1]);
  await assert.rejects(scheduler.runBatch("dda", [async () => 1], async () => []), /MODEL_RESOURCE_BATCH_RESULT_MISMATCH/);
});

test("coalesces concurrent requests into one admitted worker batch", async () => {
  const scheduler = new ModelResourceScheduler([{ device: "cuda:0", memoryMb: 500, slots: 1 }]);
  scheduler.register({ ...profile, maxQueue: 8, microbatchSize: 2, maxBatchDelayMs: 50 });
  const batches: number[][] = [];
  const first = scheduler.runBatched("dda", 1, async () => 10, async (items, tasks) => {
    batches.push([...items]);
    return Promise.all(tasks.map((task) => task()));
  });
  const second = scheduler.runBatched("dda", 2, async () => 20, async (items, tasks) => {
    batches.push([...items]);
    return Promise.all(tasks.map((task) => task()));
  });
  assert.deepEqual(await Promise.all([first, second]), [10, 20]);
  assert.deepEqual(batches, [[1, 2]]);
  assert.equal(scheduler.deviceStats()[0]?.active, 0);
});

test("flushes a partial batch at the declared maximum delay", async () => {
  const scheduler = new ModelResourceScheduler();
  scheduler.register({ ...profile, maxQueue: 4, microbatchSize: 4, maxBatchDelayMs: 5 });
  const started = Date.now();
  const result = await scheduler.runBatched("dda", "one", async () => "done", async (items) => {
    assert.deepEqual(items, ["one"]);
    return ["done"];
  });
  assert.equal(result, "done");
  assert.ok(Date.now() - started >= 3);
});
