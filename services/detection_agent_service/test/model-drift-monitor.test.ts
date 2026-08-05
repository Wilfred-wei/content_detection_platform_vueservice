import assert from "node:assert/strict";
import test from "node:test";

import { ModelDriftMonitor, parseModelDriftPolicy } from "../src/model-drift-monitor.js";

function policy(overrides: Record<string, unknown> = {}) {
  return parseModelDriftPolicy({
    schemaVersion: "model-drift-policy.v1",
    policyVersion: "test-drift-v1",
    windowSize: 20,
    minimumWindowSamples: 4,
    maxMeanZScore: 2,
    maxDetectedRateDelta: 0.2,
    maxOodRate: 0.25,
    baselines: [{ detectorId: "dda", samples: 100, meanScore: 0.5, scoreStdDev: 0.1, detectedRate: 0.5, oodRate: 0.05 }],
    ...overrides,
  });
}

test("reports insufficient windows without mutating policy", () => {
  const monitor = new ModelDriftMonitor(policy());
  monitor.observe({ detectorId: "dda", score: 0.5, outcome: "not_detected", outOfDistribution: false, timestamp: "2026-08-04T00:00:00Z" });
  const result = monitor.assess("dda");
  assert.equal(result.status, "insufficient_data");
  assert.equal(result.shadowEvaluationRequired, true);
  assert.equal(result.automaticPolicyMutation, false);
});

test("raises score and OOD drift only after the minimum window", () => {
  const monitor = new ModelDriftMonitor(policy());
  for (let index = 0; index < 4; index += 1) monitor.observe({ detectorId: "dda", score: 0.95, outcome: "detected", outOfDistribution: true, timestamp: `2026-08-04T00:00:0${index}Z` });
  const result = monitor.assess("dda");
  assert.equal(result.status, "alert");
  assert.ok(result.alerts.includes("score_mean_drift"));
  assert.ok(result.alerts.includes("ood_rate_high"));
  assert.equal(monitor.snapshot().assessments[0]?.automaticPolicyMutation, false);
});

test("keeps detectors without a baseline in shadow-only state", () => {
  const monitor = new ModelDriftMonitor(policy({ baselines: [] }));
  monitor.observe({ detectorId: "safe", score: 0.8, outcome: "detected", outOfDistribution: null, timestamp: "2026-08-04T00:00:00Z" });
  const result = monitor.assess("safe");
  assert.equal(result.status, "no_baseline");
  assert.deepEqual(result.alerts, ["baseline_missing"]);
  assert.equal(result.shadowEvaluationRequired, true);
});
