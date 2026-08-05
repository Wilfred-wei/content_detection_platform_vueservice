import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildDatasetManifest, parseDatasetManifest, parseTransformationRecipes, verifyDatasetAssets } from "../src/dataset-manifest.js";

test("validates commercial rights, source split isolation, and asset digests", () => {
  const root = mkdtempSync(join(tmpdir(), "dataset-manifest-"));
  const path = join(root, "one.bin");
  writeFileSync(path, Buffer.from("asset"));
  const manifest = parseDatasetManifest({
    schemaVersion: "ai-image-dataset-manifest.v1",
    manifestId: "owned-v1",
    revision: "2026-08-04",
    createdAt: "2026-08-04T00:00:00.000Z",
    samples: [{
      sampleId: "one", relativePath: "one.bin", sha256: createHash("sha256").update("asset").digest("hex"),
      split: "evaluation", label: "real", domain: "photo", generator: null, sourceId: "source-one",
      rights: { license: "owned", commercialUseAllowed: true, provenance: "internal" },
    }],
  });
  verifyDatasetAssets(manifest, root);
  assert.throws(() => parseDatasetManifest({
    schemaVersion: "ai-image-dataset-manifest.v1", manifestId: "leak", revision: "1", createdAt: "now",
    samples: [
      { ...manifest.samples[0], sampleId: "a", split: "calibration" },
      { ...manifest.samples[0], sampleId: "b", split: "evaluation" },
    ],
  }), /source_split_leak/);
});

test("builds a rights-explicit manifest and hashes files under the declared root", () => {
  const root = mkdtempSync(join(tmpdir(), "dataset-manifest-builder-"));
  const path = join(root, "sample.bin");
  writeFileSync(path, Buffer.from("builder-asset"));
  const manifest = buildDatasetManifest(root, [{
    path: "sample.bin",
    sampleId: "builder-sample",
    split: "calibration",
    label: "ai_generated",
    domain: "owned-generator",
    generator: "owned-v1",
    generatorRole: "owned",
    sourceId: "owned-content-1",
    rights: { license: "owned", commercialUseAllowed: true, provenance: "internal-rights-attestation-1" },
  }], { manifestId: "builder-v1", revision: "r1", createdAt: "2026-08-04T00:00:00.000Z" });
  assert.equal(manifest.samples[0]?.relativePath, "sample.bin");
  assert.equal(manifest.samples[0]?.generatorRole, "owned");
  assert.equal(manifest.samples[0]?.sha256, createHash("sha256").update("builder-asset").digest("hex"));
  verifyDatasetAssets(manifest, root);
  assert.throws(() => buildDatasetManifest(root, [{
    path: "/etc/hosts", split: "test", label: "real", domain: "photo", generator: null, sourceId: "outside",
    rights: { license: "unknown", commercialUseAllowed: true, provenance: "bad" },
  }], { manifestId: "bad", revision: "1", createdAt: "now" }), /path_escape/);
  assert.throws(() => buildDatasetManifest(root, [{
    path: "sample.bin", split: "test", label: "real", domain: "photo", generator: null, sourceId: "unlicensed",
    rights: { license: "unknown", commercialUseAllowed: false, provenance: "unverified" },
  }], { manifestId: "bad-rights", revision: "1", createdAt: "now" }), /commercial_rights/);
  assert.throws(() => parseDatasetManifest({ ...manifest, samples: [{ ...manifest.samples[0], generatorRole: "inferred" }] }), /generatorRole/);
});

test("returns resolution statistics while verifying image asset digests", () => {
  const root = mkdtempSync(join(tmpdir(), "dataset-manifest-resolution-"));
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const path = join(root, "pixel.png");
  writeFileSync(path, png);
  const manifest = parseDatasetManifest({
    schemaVersion: "ai-image-dataset-manifest.v1",
    manifestId: "resolution-v1",
    revision: "r1",
    createdAt: "2026-08-05T00:00:00.000Z",
    samples: [{
      sampleId: "pixel", relativePath: "pixel.png", sha256: createHash("sha256").update(png).digest("hex"),
      split: "evaluation", label: "real", domain: "photo", generator: null, sourceId: "owned",
      rights: { license: "owned", commercialUseAllowed: true, provenance: "internal" },
    }],
  });
  const summary = verifyDatasetAssets(manifest, root);
  assert.equal(summary.verifiedAssets, 1);
  assert.deepEqual(summary.resolution.width, { min: 1, max: 1, mean: 1, p50: 1, p95: 1 });
  assert.deepEqual(summary.resolution.height, { min: 1, max: 1, mean: 1, p50: 1, p95: 1 });
  assert.deepEqual(summary.resolution.orientation, { landscape: 0, portrait: 0, square: 1 });
  assert.equal(summary.byLabel.real.samplesWithDimensions, 1);
  assert.equal(summary.byLabel.ai_generated.samplesWithDimensions, 0);
});

test("keeps explicitly restricted research manifests separate from commercial-cleared data", () => {
  const manifest = parseDatasetManifest({
    schemaVersion: "ai-image-dataset-manifest.v1",
    manifestId: "research-only",
    revision: "2026-08-04",
    createdAt: "2026-08-04T00:00:00.000Z",
    rightsPolicy: "research_only",
    samples: [{
      sampleId: "research-1",
      relativePath: "sample.bin",
      sha256: "a".repeat(64),
      split: "evaluation",
      label: "ai_generated",
      domain: "held-out-generator",
      generator: "generator-v1",
      sourceId: "research-source",
      rights: { license: "dataset-card-only", commercialUseAllowed: false, provenance: "source-terms-unverified" },
    }],
  });
  assert.equal(manifest.rightsPolicy, "research_only");
  assert.equal(manifest.samples[0].rights.commercialUseAllowed, false);
  assert.equal(manifest.samples[0].generatorRole, "unknown");
  assert.throws(() => parseDatasetManifest({
    ...manifest,
    samples: [{ ...manifest.samples[0], label: "ai_generated", generator: null }],
  }), /generator:0/);
});

test("accepts only bounded deterministic transformation recipes", () => {
  const recipes = parseTransformationRecipes([
    { id: "resize-512", operation: "resize", parameters: { width: 512, height: 512 } },
    { id: "jpeg-90", operation: "recompress", parameters: { quality: 90 } },
  ]);
  assert.equal(recipes.length, 2);
  assert.throws(() => parseTransformationRecipes([{ id: "shell", operation: "exec", parameters: {} }]), /INVALID_TRANSFORMATION_RECIPES/);
});
