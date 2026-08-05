import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";

import { loadProvenanceRegistry } from "./provenance-registry.js";

export type OfficialVerifierResult = "detected" | "not_detected" | "inconclusive" | "unsupported" | "error";
export type OwnedSampleLabel = "ai_generated" | "non_ai" | "unknown";

export interface ManualOfficialVerifierInput {
  schemeId: string;
  asset: {
    sampleId: string;
    sha256: string;
    ownership: "owned_or_authorized";
    sourceLabel: OwnedSampleLabel;
  };
  verification: {
    method: "manual_official_verifier";
    portalUrl: string;
    performedAt: string;
    operatorId: string;
    result: OfficialVerifierResult;
    artifactSha256: string;
    note: string | null;
  };
}

export interface ManualOfficialVerifierRecord extends ManualOfficialVerifierInput {
  schemaVersion: "manual-official-verifier-evaluation.v1";
  recordId: string;
  recordedAt: string;
  restrictions: {
    automatedAccess: false;
    productionEvidenceEligible: false;
    shortCircuitEligible: false;
    policyMutationAllowed: false;
  };
}

export interface ManualOfficialVerifierSummary {
  schemaVersion: "manual-official-verifier-summary.v1";
  manifestSha256: string;
  records: number;
  schemes: Record<string, number>;
  results: Record<OfficialVerifierResult, number>;
  restrictions: ManualOfficialVerifierRecord["restrictions"];
}

const RESTRICTIONS: ManualOfficialVerifierRecord["restrictions"] = Object.freeze({
  automatedAccess: false,
  productionEvidenceEligible: false,
  shortCircuitEligible: false,
  policyMutationAllowed: false,
});
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CLOSED_MANUAL_ACCESS = new Set(["manual_public_verifier", "manual_limited_verifier", "vendor_assisted"]);

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`INVALID_MANUAL_OFFICIAL_VERIFIER_RECORD:${field}`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], field: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`INVALID_MANUAL_OFFICIAL_VERIFIER_RECORD:${field}:fields`);
  }
}

function boundedText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`INVALID_MANUAL_OFFICIAL_VERIFIER_RECORD:${field}`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(normalized)) {
    throw new Error(`INVALID_MANUAL_OFFICIAL_VERIFIER_RECORD:${field}`);
  }
  return normalized;
}

function sha256(value: unknown, field: string): string {
  const normalized = boundedText(value, field, 64).toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) throw new Error(`INVALID_MANUAL_OFFICIAL_VERIFIER_RECORD:${field}`);
  return normalized;
}

function instant(value: unknown, field: string): string {
  const normalized = boundedText(value, field, 40);
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== normalized) {
    throw new Error(`INVALID_MANUAL_OFFICIAL_VERIFIER_RECORD:${field}`);
  }
  return normalized;
}

function nullableNote(value: unknown): string | null {
  if (value === null) return null;
  return boundedText(value, "verification:note", 500);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(stableValue(value))).digest("hex");
}

function officialPortalUrl(value: unknown, schemeId: string): string {
  const normalized = boundedText(value, "verification:portalUrl", 500);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("INVALID_MANUAL_OFFICIAL_VERIFIER_RECORD:verification:portalUrl");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("INVALID_MANUAL_OFFICIAL_VERIFIER_RECORD:verification:portalUrl");
  }
  const scheme = loadProvenanceRegistry().schemes.find((candidate) => candidate.id === schemeId);
  if (!scheme || scheme.family !== "closed_vendor_verifier" || !CLOSED_MANUAL_ACCESS.has(scheme.accessClass)) {
    throw new Error(`MANUAL_OFFICIAL_VERIFIER_NOT_EVALUATION_ONLY:${schemeId}`);
  }
  const officialHosts = new Set(scheme.primarySources.map((source) => new URL(source).hostname));
  if (!officialHosts.has(url.hostname)) {
    throw new Error(`UNOFFICIAL_VERIFIER_PORTAL:${schemeId}:${url.hostname}`);
  }
  return url.toString();
}

function parseInput(value: unknown): ManualOfficialVerifierInput {
  const root = object(value, "root");
  exactKeys(root, ["schemeId", "asset", "verification"], "root");
  const schemeId = boundedText(root.schemeId, "schemeId", 100);
  const asset = object(root.asset, "asset");
  exactKeys(asset, ["sampleId", "sha256", "ownership", "sourceLabel"], "asset");
  if (asset.ownership !== "owned_or_authorized") {
    throw new Error("MANUAL_OFFICIAL_VERIFIER_SAMPLE_NOT_OWNED");
  }
  if (!(["ai_generated", "non_ai", "unknown"] as const).includes(asset.sourceLabel as OwnedSampleLabel)) {
    throw new Error("INVALID_MANUAL_OFFICIAL_VERIFIER_RECORD:asset:sourceLabel");
  }
  const verification = object(root.verification, "verification");
  exactKeys(
    verification,
    ["method", "portalUrl", "performedAt", "operatorId", "result", "artifactSha256", "note"],
    "verification",
  );
  if (verification.method !== "manual_official_verifier") {
    throw new Error("AUTOMATED_OFFICIAL_VERIFIER_ACCESS_PROHIBITED");
  }
  if (!(["detected", "not_detected", "inconclusive", "unsupported", "error"] as const).includes(verification.result as OfficialVerifierResult)) {
    throw new Error("INVALID_MANUAL_OFFICIAL_VERIFIER_RECORD:verification:result");
  }
  return {
    schemeId,
    asset: {
      sampleId: boundedText(asset.sampleId, "asset:sampleId", 160),
      sha256: sha256(asset.sha256, "asset:sha256"),
      ownership: "owned_or_authorized",
      sourceLabel: asset.sourceLabel as OwnedSampleLabel,
    },
    verification: {
      method: "manual_official_verifier",
      portalUrl: officialPortalUrl(verification.portalUrl, schemeId),
      performedAt: instant(verification.performedAt, "verification:performedAt"),
      operatorId: boundedText(verification.operatorId, "verification:operatorId", 100),
      result: verification.result as OfficialVerifierResult,
      artifactSha256: sha256(verification.artifactSha256, "verification:artifactSha256"),
      note: nullableNote(verification.note),
    },
  };
}

function inputIdentity(input: ManualOfficialVerifierInput): string {
  return digest(input);
}

export function createManualOfficialVerifierRecord(
  value: unknown,
  recordedAt = new Date().toISOString(),
): ManualOfficialVerifierRecord {
  const input = parseInput(value);
  return {
    schemaVersion: "manual-official-verifier-evaluation.v1",
    recordId: inputIdentity(input),
    recordedAt: instant(recordedAt, "recordedAt"),
    ...input,
    restrictions: { ...RESTRICTIONS },
  };
}

export function parseManualOfficialVerifierRecord(value: unknown): ManualOfficialVerifierRecord {
  const root = object(value, "stored");
  exactKeys(
    root,
    ["schemaVersion", "recordId", "recordedAt", "schemeId", "asset", "verification", "restrictions"],
    "stored",
  );
  if (root.schemaVersion !== "manual-official-verifier-evaluation.v1") {
    throw new Error("INVALID_MANUAL_OFFICIAL_VERIFIER_RECORD:schemaVersion");
  }
  const restrictions = object(root.restrictions, "restrictions");
  exactKeys(
    restrictions,
    ["automatedAccess", "productionEvidenceEligible", "shortCircuitEligible", "policyMutationAllowed"],
    "restrictions",
  );
  if (
    restrictions.automatedAccess !== false
    || restrictions.productionEvidenceEligible !== false
    || restrictions.shortCircuitEligible !== false
    || restrictions.policyMutationAllowed !== false
  ) {
    throw new Error("MANUAL_OFFICIAL_VERIFIER_AUTHORITY_ESCALATION");
  }
  const input = parseInput({ schemeId: root.schemeId, asset: root.asset, verification: root.verification });
  const recordId = sha256(root.recordId, "recordId");
  if (recordId !== inputIdentity(input)) throw new Error("MANUAL_OFFICIAL_VERIFIER_RECORD_ID_MISMATCH");
  return {
    schemaVersion: "manual-official-verifier-evaluation.v1",
    recordId,
    recordedAt: instant(root.recordedAt, "recordedAt"),
    ...input,
    restrictions: { ...RESTRICTIONS },
  };
}

export function parseManualOfficialVerifierJsonl(raw: string): ManualOfficialVerifierRecord[] {
  const records = raw.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    try {
      return parseManualOfficialVerifierRecord(JSON.parse(line) as unknown);
    } catch (error) {
      throw new Error(`INVALID_MANUAL_OFFICIAL_VERIFIER_MANIFEST:line_${index + 1}:${error instanceof Error ? error.message : "unknown"}`);
    }
  });
  if (new Set(records.map((record) => record.recordId)).size !== records.length) {
    throw new Error("DUPLICATE_MANUAL_OFFICIAL_VERIFIER_RECORD");
  }
  return records;
}

export async function appendManualOfficialVerifierRecord(
  path: string,
  record: ManualOfficialVerifierRecord,
): Promise<void> {
  const normalized = parseManualOfficialVerifierRecord(record);
  let existing: ManualOfficialVerifierRecord[] = [];
  try {
    existing = parseManualOfficialVerifierJsonl(await readFile(path, "utf8"));
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  if (existing.some((candidate) => candidate.recordId === normalized.recordId)) {
    throw new Error(`DUPLICATE_MANUAL_OFFICIAL_VERIFIER_RECORD:${normalized.recordId}`);
  }
  await appendFile(path, `${JSON.stringify(normalized)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function summarizeManualOfficialVerifierManifest(raw: string): ManualOfficialVerifierSummary {
  const records = parseManualOfficialVerifierJsonl(raw);
  const results: Record<OfficialVerifierResult, number> = {
    detected: 0,
    not_detected: 0,
    inconclusive: 0,
    unsupported: 0,
    error: 0,
  };
  const schemes: Record<string, number> = {};
  for (const record of records) {
    results[record.verification.result] += 1;
    schemes[record.schemeId] = (schemes[record.schemeId] || 0) + 1;
  }
  return {
    schemaVersion: "manual-official-verifier-summary.v1",
    manifestSha256: digest(raw),
    records: records.length,
    schemes,
    results,
    restrictions: { ...RESTRICTIONS },
  };
}
