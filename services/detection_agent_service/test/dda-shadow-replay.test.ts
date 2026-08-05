import assert from "node:assert/strict";
import test from "node:test";

import {
  imageMimeType,
  parseDdaReplaySourceManifest,
  selectBalancedDdaReplay,
  type DdaReplaySourceRecord,
} from "../src/dda-shadow-replay.js";

function source(domain: string, label: 0 | 1, index: number): DdaReplaySourceRecord {
  return {
    benchmark: "benchmark",
    domain,
    label,
    samplePath: `/data/${domain}/${label}/${index}.png`,
    split: "balanced",
    suite: "dda11",
  };
}

test("selects a deterministic domain-balanced real/fake replay slice", () => {
  const records = ["a", "b", "c"].flatMap((domain) => [
    source(domain, 0, 1), source(domain, 0, 2), source(domain, 1, 1), source(domain, 1, 2),
  ]);
  const first = selectBalancedDdaReplay(records, { seed: 3521, maxDomains: 2, perClass: 1 });
  const second = selectBalancedDdaReplay([...records].reverse(), { seed: 3521, maxDomains: 2, perClass: 1 });

  assert.deepEqual(first, second);
  assert.equal(first.length, 4);
  assert.equal(new Set(first.map((record) => record.subgroup)).size, 2);
  for (const subgroup of new Set(first.map((record) => record.subgroup))) {
    assert.deepEqual(first.filter((record) => record.subgroup === subgroup).map((record) => record.label).sort(), [0, 1]);
  }
});

test("skips incomplete domains and rejects a manifest without balanced domains", () => {
  const complete = [source("complete", 0, 1), source("complete", 1, 1)];
  const incomplete = [source("incomplete", 1, 1), source("incomplete", 1, 2)];
  const selected = selectBalancedDdaReplay([...complete, ...incomplete], { seed: 1, maxDomains: 4, perClass: 1 });
  assert.deepEqual([...new Set(selected.map((record) => record.subgroup))], ["benchmark/complete"]);
  assert.throws(() => selectBalancedDdaReplay(incomplete, { seed: 1, maxDomains: 4, perClass: 1 }), /NO_BALANCED_DOMAINS/);
});

test("strictly parses source labels, absolute paths, and supported live MIME types", () => {
  const raw = JSON.stringify({
    benchmark: "B", domain: "D", label: 1, sample_path: "/data/a.JPEG", split: "balanced", suite: "dda11",
  });
  assert.equal(parseDdaReplaySourceManifest(raw)[0]?.samplePath, "/data/a.JPEG");
  assert.equal(imageMimeType("/data/a.JPEG"), "image/jpeg");
  assert.equal(imageMimeType("/data/a.jfif"), "image/jpeg");
  assert.equal(imageMimeType("/data/a.webp"), "image/webp");
  assert.throws(() => parseDdaReplaySourceManifest(JSON.stringify({
    benchmark: "B", domain: "D", label: 2, sample_path: "/data/a.png", split: "balanced", suite: "dda11",
  })), /label/);
  assert.throws(() => imageMimeType("/data/a.gif"), /UNSUPPORTED_EXTENSION/);
});
