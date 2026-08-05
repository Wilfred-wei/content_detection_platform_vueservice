import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { LocalMetadataInspector } from "../src/metadata-inspector.js";
import {
  controlledEvaluationMetadataAuthentication,
  createEvaluationAigcMarker,
  jpegWithEvaluationAigcXmp,
} from "../src/provenance-evaluation-fixtures.js";
import {
  loadProvenanceEvaluationManifest,
  parseProvenanceEvaluationManifest,
  summarizeProvenanceEvaluationManifest,
  verifyProvenanceEvaluationAssets,
} from "../src/provenance-evaluation-manifest.js";
import { loadProvenanceReleaseGateRegistry } from "../src/provenance-release-gates.js";

const MANIFEST_PATH = fileURLToPath(new URL("../resources/provenance-evaluation-manifest.v1.json", import.meta.url));
const BASE_JPEG = fileURLToPath(new URL("fixtures/c2pa/C.jpg", import.meta.url));

function rawManifest(): any {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

function digest(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

test("loads a rights-cleared evaluation-only manifest and verifies every local asset binding", () => {
  const manifest = loadProvenanceEvaluationManifest();
  verifyProvenanceEvaluationAssets(manifest);
  const summary = summarizeProvenanceEvaluationManifest(manifest);

  assert.equal(summary.cases, 15);
  assert.equal(summary.caseTypes.watermark_positive, 9);
  assert.equal(summary.caseTypes.authenticated_metadata, 1);
  assert.equal(summary.caseTypes.unsigned_metadata, 1);
  assert.equal(summary.caseTypes.c2pa_trusted, 1);
  assert.equal(summary.caseTypes.c2pa_untrusted, 1);
  assert.equal(summary.caseTypes.unmarked_control, 2);
  assert.equal(summary.releaseGateEligible, false);
  assert.match(summary.releaseGateGap, /10000 unmarked controls/);
  assert.ok(manifest.cases.every((item) => item.rights.commercialEvaluationAllowed));
  assert.ok(manifest.cases.every((item) => !item.asset.relativePath?.includes(".data/analyses")));
});

test("covers every current release-gated scheme with a positive or trusted provenance case", () => {
  const manifest = loadProvenanceEvaluationManifest();
  for (const gate of loadProvenanceReleaseGateRegistry().gates) {
    const matching = manifest.cases.filter((item) => item.targetSchemeIds.includes(gate.schemeId));
    assert.ok(matching.length > 0, `missing cases for ${gate.schemeId}`);
    if (gate.schemeId === "c2pa") {
      assert.ok(matching.some((item) => item.caseType === "c2pa_trusted"));
      assert.ok(matching.some((item) => item.caseType === "c2pa_untrusted"));
    } else {
      assert.ok(matching.some((item) => item.caseType === "watermark_positive"));
    }
  }
});

test("metadata recipes reproduce the declared bytes and controlled authority states", async () => {
  const manifest = loadProvenanceEvaluationManifest();
  const base = readFileSync(BASE_JPEG);
  const directory = mkdtempSync(join(tmpdir(), "provenance-evaluation-metadata-"));

  for (const mode of ["unsigned", "controlled_authenticated"] as const) {
    const caseType = mode === "unsigned" ? "unsigned_metadata" : "authenticated_metadata";
    const planned = manifest.cases.find((item) => item.caseType === caseType);
    assert.ok(planned);
    const bytes = jpegWithEvaluationAigcXmp(base, createEvaluationAigcMarker(mode));
    assert.equal(bytes.length, planned.asset.sizeBytes);
    assert.equal(digest(bytes), planned.asset.sha256);
    const path = join(directory, `${mode}.jpg`);
    writeFileSync(path, bytes);
    const inspector = mode === "controlled_authenticated"
      ? new LocalMetadataInspector({ async authenticate() { return controlledEvaluationMetadataAuthentication(); } })
      : new LocalMetadataInspector();
    const inspection = await inspector.inspect(path, "image/jpeg");
    assert.equal(inspection.aigc.outcome, planned.expected.outcome);
  }
});

test("rejects authority escalation, unknown schemes, incomplete coverage, and path traversal", () => {
  const elevated = rawManifest();
  elevated.releaseGateEligible = true;
  assert.throws(() => parseProvenanceEvaluationManifest(elevated), /AUTHORITY_ESCALATION/);

  const unknownScheme = rawManifest();
  unknownScheme.cases[0].targetSchemeIds = ["unknown-scheme"];
  assert.throws(() => parseProvenanceEvaluationManifest(unknownScheme), /targetSchemeIds/);

  const missingCoverage = rawManifest();
  missingCoverage.cases = missingCoverage.cases.filter((item: any) => item.caseType !== "unsigned_metadata");
  assert.throws(() => parseProvenanceEvaluationManifest(missingCoverage), /COVERAGE_MISSING:unsigned_metadata/);

  const traversal = rawManifest();
  traversal.cases[0].asset.relativePath = "../../private.jpg";
  assert.throws(() => parseProvenanceEvaluationManifest(traversal), /asset:relativePath:path/);
});

test("rejects changed recipe parameters, missing rights, and asset digest substitution", () => {
  const recipeMutation = rawManifest();
  const recipeCase = recipeMutation.cases.find((item: any) => item.asset.recipe);
  recipeCase.asset.recipe.parameters.seed = 1;
  assert.throws(() => parseProvenanceEvaluationManifest(recipeMutation), /RECIPE_PARAMETERS_MISMATCH/);

  const missingLicense = rawManifest();
  missingLicense.cases[0].rights.license = "";
  assert.throws(() => parseProvenanceEvaluationManifest(missingLicense), /rights:license/);

  const digestMutation = rawManifest();
  digestMutation.cases[0].asset.sha256 = "0".repeat(64);
  const parsed = parseProvenanceEvaluationManifest(digestMutation);
  assert.throws(() => verifyProvenanceEvaluationAssets(parsed), /ASSET_DIGEST_MISMATCH/);
});
