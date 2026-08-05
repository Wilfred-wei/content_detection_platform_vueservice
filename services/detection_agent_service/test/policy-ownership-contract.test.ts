import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AnalysisService } from "../src/analysis-service.js";
import { AnalysisStore } from "../src/analysis-store.js";
import { ACTIVE_DIRECT_EVIDENCE_POLICY, validateDirectEvidencePolicy } from "../src/direct-evidence-policy.js";
import type { AnalysisScheduler } from "../src/analysis-queue.js";
import type { AnalysisSubmission } from "../src/analysis-types.js";
import type { ModelDetector } from "../src/model-detector.js";

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const idleScheduler: AnalysisScheduler = {
  start() {},
  enqueue() {},
  cancel() { return false; },
  isLeaseCurrent() { return true; },
  stats() { return { queued: 0, running: 0, capacity: 1, maxQueue: 1, concurrency: 1, oldestQueuedAt: null, recoveredLeases: 0, expiredJobs: 0 }; },
  close() {},
};

const registeredDetector: ModelDetector = {
  id: "registered-detector",
  enabled: true,
  async detect() { throw new Error("IDLE_SCHEDULER_MUST_NOT_EXECUTE"); },
};

test("direct-evidence work and detector selection remain policy-owned", () => {
  validateDirectEvidencePolicy(ACTIVE_DIRECT_EVIDENCE_POLICY);
  assert.deepEqual(ACTIVE_DIRECT_EVIDENCE_POLICY.scheduledCollectors, ["c2pa", "registered_watermarks", "metadata"]);
  assert.equal(ACTIVE_DIRECT_EVIDENCE_POLICY.barrier, "all_scheduled_terminal");
  assert.equal(ACTIVE_DIRECT_EVIDENCE_POLICY.requireConflictCheckBeforeShortCircuit, true);

  const service = new AnalysisService(
    new AnalysisStore(mkdtempSync(join(tmpdir(), "policy-ownership-"))),
    1024 * 1024,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    registeredDetector,
    ACTIVE_DIRECT_EVIDENCE_POLICY,
    undefined,
    idleScheduler,
  );
  const submission = {
    filename: "pixel.png",
    mimeType: "image/png",
    dataBase64: ONE_PIXEL_PNG,
    detectorId: "attacker-selected-detector",
    detectorSelection: ["attacker-selected-detector"],
    options: { enableLocalization: false },
  } as unknown as AnalysisSubmission;
  const analysis = service.submit(submission).analysis;

  assert.equal(analysis.directEvidencePolicyVersion, ACTIVE_DIRECT_EVIDENCE_POLICY.policyVersion);
  assert.equal(analysis.executionPlan.find((node) => node.stageId === "model_detection")?.condition, "unresolved_and_detector_available");
  assert.equal(JSON.stringify(analysis.executionPlan).includes("attacker-selected-detector"), false);
  assert.equal(analysis.state, "queued");
});
