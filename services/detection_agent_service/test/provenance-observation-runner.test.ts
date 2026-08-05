import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { EvidenceRecord } from "../src/analysis-types.js";
import type { WatermarkInspector } from "../src/watermark-adapters.js";
import {
  collectProvenanceObservation,
  parseProvenanceObservationCase,
  type ProvenanceObservationCase,
} from "../src/provenance-observation-runner.js";

const IMAGE = (() => {
  const bytes = Buffer.alloc(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.writeUInt32BE(512, 16);
  bytes.writeUInt32BE(512, 20);
  return bytes;
})();
const SHA = createHash("sha256").update(IMAGE).digest("hex");

function input(overrides: Partial<ProvenanceObservationCase> = {}): ProvenanceObservationCase {
  return {
    schemaVersion: "provenance-observation-case.v1",
    evaluationRunId: "runner-test-v1",
    recordId: "record-1",
    sampleId: "sample-1",
    assetPath: "sample.png",
    assetSha256: SHA,
    datasetManifestSha256: "a".repeat(64),
    transformationSuiteSha256: "b".repeat(64),
    schemeId: "sdxl-invisible-watermark",
    profileId: "diffusers-sdxl-default-48bit-v1",
    configurationId: "test-profile-v1",
    partition: "evaluation",
    label: "marked_positive",
    transformationId: "original",
    transformationCategory: "original",
    viewPolicyId: "single-view-v1",
    ...overrides,
  };
}

function evidence(outcome: string, score: number | null, threshold: number | null): EvidenceRecord {
  return {
    schemaVersion: "1.17.0",
    id: "evidence-1",
    analysisId: "runner-test-v1",
    category: "watermark",
    source: "sdxl-invisible-watermark",
    status: outcome === "not_detected" ? "not_detected" : "possibly_present",
    strength: "supporting",
    summary: "test",
    facts: { outcome, score, threshold, attemptedViews: 4, latencyMs: 12 },
    createdAt: "2026-08-05T00:00:00.000Z",
  };
}

function fakeInspector(record: EvidenceRecord): WatermarkInspector {
  return { inspect: async () => [record] };
}

test("parses a strict case and rejects path traversal or unknown profiles", () => {
  assert.deepEqual(parseProvenanceObservationCase(input()), input());
  const c2paCase = parseProvenanceObservationCase(input({
    schemeId: "c2pa",
    profileId: "scheme-default",
  }));
  assert.equal(c2paCase.profileId, "scheme-default");
  assert.throws(() => parseProvenanceObservationCase({ ...input(), assetPath: "../sample.png" }), /assetPath/);
  assert.throws(() => parseProvenanceObservationCase({ ...input(), profileId: "unknown" }), /profileId/);
  assert.throws(() => parseProvenanceObservationCase({ ...input(), extra: true }), /fields/);
});

test("collects positive and negative adapter evidence without promoting provenance", async () => {
  const directory = await mkdtemp(join(tmpdir(), "provenance-observation-runner-"));
  try {
    const path = join(directory, "sample.png");
    await writeFile(path, IMAGE);
    const positive = await collectProvenanceObservation(input(), { absolutePath: path, inspector: fakeInspector(evidence("possibly_present", 0.9, 0.5)) });
    assert.equal(positive.detection.outcome, "positive");
    assert.equal(positive.detection.positive, true);
    assert.equal(positive.detection.score, 0.9);
    assert.equal(positive.attemptedViews, 4);

    const negative = await collectProvenanceObservation(
      input({ recordId: "record-2", sampleId: "sample-2", label: "unmarked_control" }),
      { absolutePath: path, inspector: fakeInspector(evidence("not_detected", 0.1, 0.5)) },
    );
    assert.equal(negative.detection.outcome, "negative");
    assert.equal(negative.detection.positive, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("binds observations to the expected asset bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "provenance-observation-runner-"));
  try {
    const path = join(directory, "sample.png");
    await writeFile(path, IMAGE);
    await assert.rejects(
      collectProvenanceObservation(input({ assetSha256: "c".repeat(64) }), { absolutePath: path, inspector: fakeInspector(evidence("not_detected", 0.1, 0.5)) }),
      /ASSET_DIGEST_MISMATCH/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
