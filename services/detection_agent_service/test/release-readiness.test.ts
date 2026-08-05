import assert from "node:assert/strict";
import test from "node:test";

import { loadModelCandidateRegistry } from "../src/model-registry.js";
import { loadPolicyBundle } from "../src/policy-bundle.js";
import { loadProvenanceRegistry } from "../src/provenance-registry.js";
import { assessReleaseReadiness } from "../src/release-readiness.js";

test("reports explicit production blockers without granting promotion authority", () => {
  const report = assessReleaseReadiness({
    policyBundle: loadPolicyBundle(),
    policyBundleVerified: true,
    requireAuth: false,
    storageEncryptionConfigured: false,
    productionLabelingAuthorized: false,
    modelRegistry: loadModelCandidateRegistry(),
    provenanceRegistry: loadProvenanceRegistry(),
    modelRuntime: [{
      detectorId: "dda-dinov2-lora",
      enabled: true,
      device: "cuda:0",
      residency: "process_scoped",
      admission: "single_slot_bounded_queue",
      maxQueue: 1,
      microbatchSize: 1,
      resourceClass: "gpu",
    }],
    modelDeviceCapacityCount: 0,
    explanationEvaluationStatus: "prototype_not_calibrated",
    forensicEvaluationStatus: "prototype_not_calibrated",
  }, "2026-08-04T00:00:00.000Z");
  assert.equal(report.status, "blocked");
  assert.equal(report.productionSwapAuthorized, false);
  assert.equal(report.automaticPolicyMutation, false);
  assert.ok(report.checks.find((check) => check.id === "public_security_configuration")?.reasons.includes("authentication_required"));
  assert.ok(report.checks.find((check) => check.id === "production_labeling_authority")?.reasons.includes("operator_promotion_required_after_release_evidence"));
  assert.ok(report.checks.find((check) => check.id === "model_quality_and_capacity")?.reasons.includes("primary_deployment_calibration_missing"));
  assert.ok(report.checks.find((check) => check.id === "provenance_short_circuit")?.reasons.length);
});

test("does not block a policy bundle-only environment on model or provenance checks that are not enabled", () => {
  const registry = loadModelCandidateRegistry();
  const report = assessReleaseReadiness({
    policyBundle: loadPolicyBundle(),
    policyBundleVerified: true,
    requireAuth: true,
    storageEncryptionConfigured: true,
    productionLabelingAuthorized: true,
    modelRegistry: registry,
    provenanceRegistry: { ...loadProvenanceRegistry(), schemes: loadProvenanceRegistry().schemes.map((scheme) => ({ ...scheme, shortCircuit: { ...scheme.shortCircuit, policy: "prohibited" as const } })) },
    modelRuntime: [],
    modelDeviceCapacityCount: 0,
    explanationEvaluationStatus: "approved",
    forensicEvaluationStatus: "approved",
  });
  assert.equal(report.status, "blocked");
  assert.ok(report.checks.find((check) => check.id === "model_quality_and_capacity")?.reasons.includes("no_enabled_model_route"));
});
