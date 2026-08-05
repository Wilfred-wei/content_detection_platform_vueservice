import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { parseDdaShadowAuditJsonl, parseDdaShadowTruthJsonl } from "../src/dda-shadow-evaluation.js";
import {
  assessDdaShadowReview,
  parseDdaShadowReviewProfile,
  selectDdaShadowReviewWindow,
  writePrivateDdaShadowReviewSnapshot,
} from "../src/dda-shadow-review.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`MISSING_OPTION_VALUE:${name}`);
  return value;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const auditPath = option("--audit");
const profilePath = option("--profile");
const since = option("--since");
const until = option("--until");
if (!auditPath || !profilePath || !since || !until) {
  throw new Error("USAGE: assess-dda-shadow --audit <audit.jsonl> --profile <profile.json> --since <ISO> --until <ISO> [--labels <truth.jsonl>] [--output <new.json>]");
}
const truthPath = option("--labels");
const outputPath = option("--output");
const [auditRaw, profileRaw, truthRaw] = await Promise.all([
  readFile(auditPath, "utf8"),
  readFile(profilePath, "utf8"),
  truthPath ? readFile(truthPath, "utf8") : Promise.resolve(null),
]);
let profileValue: unknown;
try {
  profileValue = JSON.parse(profileRaw);
} catch {
  throw new Error("INVALID_DDA_SHADOW_REVIEW_PROFILE:json");
}
const profile = parseDdaShadowReviewProfile(profileValue);
const records = selectDdaShadowReviewWindow(parseDdaShadowAuditJsonl(auditRaw), {
  since,
  until,
  maximumRecords: profile.window.maximumRecords,
});
const labels = truthRaw === null ? [] : parseDdaShadowTruthJsonl(truthRaw);
const assessment = assessDdaShadowReview(records, labels, profile, {
  since,
  until,
  profileSha256: digest(profileRaw),
  auditSha256: digest(auditRaw),
  truthSha256: truthRaw === null ? null : digest(truthRaw),
});
if (outputPath) await writePrivateDdaShadowReviewSnapshot(outputPath, assessment);
process.stdout.write(`${JSON.stringify(assessment, null, 2)}\n`);
