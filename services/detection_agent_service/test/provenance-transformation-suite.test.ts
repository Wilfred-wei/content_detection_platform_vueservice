import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadProvenanceTransformationSuite,
  parseProvenanceTransformationSuite,
  summarizeProvenanceTransformationSuite,
  verifyProvenanceTransformationArtifacts,
} from "../src/provenance-transformation-suite.js";

const SUITE_PATH = fileURLToPath(new URL("../resources/provenance-transformation-suite.v1.json", import.meta.url));

function rawSuite(): any {
  return JSON.parse(readFileSync(SUITE_PATH, "utf8"));
}

test("loads the complete deterministic transformation suite and verifies pinned artifacts", () => {
  const suite = loadProvenanceTransformationSuite();
  verifyProvenanceTransformationArtifacts(suite);
  const summary = summarizeProvenanceTransformationSuite(suite);

  assert.equal(summary.recipes, 13);
  assert.deepEqual(summary.operations, {
    resize: 1,
    recompression: 1,
    crop: 1,
    screenshot: 1,
    blur: 1,
    color_edit: 1,
    overlay: 1,
    metadata_removal: 1,
    visible_label_forgery: 1,
    adversarial: 4,
  });
  assert.deepEqual(summary.adversarialProfiles, [
    "blur_overlay",
    "metadata_label",
    "screenshot_jpeg",
    "social_jpeg_resize",
  ]);
  assert.equal(summary.releaseGateEligible, false);
  assert.ok(suite.recipes.every((recipe) => recipe.metadataExpected === "removed"));
});

test("rejects parameter drift, output-format drift, and missing operation coverage", () => {
  const changedParameters = rawSuite();
  changedParameters.recipes[0].parameters.width = 512;
  assert.throws(() => parseProvenanceTransformationSuite(changedParameters), /PARAMETERS_MISMATCH/);

  const changedFormat = rawSuite();
  changedFormat.recipes[0].outputFormat = "jpeg";
  assert.throws(() => parseProvenanceTransformationSuite(changedFormat), /OUTPUT_FORMAT_MISMATCH/);

  const missingCrop = rawSuite();
  missingCrop.recipes = missingCrop.recipes.filter((recipe: any) => recipe.operation !== "crop");
  assert.throws(() => parseProvenanceTransformationSuite(missingCrop), /COVERAGE_MISSING:crop/);
});

test("rejects authority escalation, arbitrary chains, unknown profiles, and path traversal", () => {
  const elevated = rawSuite();
  elevated.releaseGateEligible = true;
  assert.throws(() => parseProvenanceTransformationSuite(elevated), /AUTHORITY_ESCALATION/);

  const arbitrary = rawSuite();
  arbitrary.policy.arbitraryOperationChainsAllowed = true;
  assert.throws(() => parseProvenanceTransformationSuite(arbitrary), /AUTHORITY_ESCALATION/);

  const unknownProfile = rawSuite();
  const adversarial = unknownProfile.recipes.find((recipe: any) => recipe.operation === "adversarial");
  adversarial.parameters.profile = "unknown";
  assert.throws(() => parseProvenanceTransformationSuite(unknownProfile), /parameters:profile/);

  const traversal = rawSuite();
  traversal.worker.implementationPath = "../../private.py";
  assert.throws(() => parseProvenanceTransformationSuite(traversal), /implementationPath:path/);
});

test("rejects implementation and dependency lock substitution", () => {
  const implementation = rawSuite();
  implementation.worker.implementationSha256 = "0".repeat(64);
  const parsedImplementation = parseProvenanceTransformationSuite(implementation);
  assert.throws(() => verifyProvenanceTransformationArtifacts(parsedImplementation), /IMPLEMENTATION_MISMATCH/);

  const lock = rawSuite();
  lock.worker.lockSha256 = "0".repeat(64);
  const parsedLock = parseProvenanceTransformationSuite(lock);
  assert.throws(() => verifyProvenanceTransformationArtifacts(parsedLock), /LOCK_MISMATCH/);
});
