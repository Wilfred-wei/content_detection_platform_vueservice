import {
  ANALYSIS_POLICY_VERSION,
  ANALYSIS_SCHEMA_VERSION,
  type DecisionRecord,
  type EvidenceRecord,
} from "./analysis-types.js";

function isVerifiedOriginEvidence(evidence: EvidenceRecord): boolean {
  return ["provenance", "watermark"].includes(evidence.category)
    && evidence.status === "verified_present"
    && evidence.strength === "strong"
    && evidence.facts.provenanceVerified === true
    && typeof evidence.facts.aiOrigin === "boolean";
}

export function decideProvenanceFirst(
  evidence: EvidenceRecord[],
  decidedAt = new Date().toISOString(),
  modelEnabled = false,
): DecisionRecord {
  const verified = evidence.filter(isVerifiedOriginEvidence);
  const verifiedAi = verified.filter((item) => item.facts.aiOrigin === true);
  const verifiedNonAi = verified.filter((item) => item.facts.aiOrigin === false);
  const conflicts = verifiedAi.length && verifiedNonAi.length
    ? [
        `VERIFIED_ORIGIN_CONFLICT:${verifiedAi.map((item) => item.source).join(",")}:${verifiedNonAi.map((item) => item.source).join(",")}`,
      ]
    : [];

  if (verifiedAi.length > 0 && conflicts.length === 0) {
    return {
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      verdict: "AI_GENERATED",
      confidenceBand: "high",
      basis: verifiedAi.map((item) => `VERIFIED_PROVENANCE:${item.source}`),
      evidenceRefs: evidence.map((item) => item.id),
      conflicts,
      modelCoverage: modelEnabled ? "enabled" : "policy_disabled",
      policyVersion: ANALYSIS_POLICY_VERSION,
      decidedAt,
    };
  }

  const modelSignals = evidence.filter((item) => item.category === "model"
    && ["detected", "not_detected"].includes(item.status)
    && item.strength === "supporting"
    && item.facts.outOfDistribution !== true
    && typeof item.facts.score === "number");
  const modelBasis = modelSignals.map((item) => {
    const direction = item.status === "detected" ? "AI" : "NON_AI";
    return item.source === "dda-dinov2-lora"
      ? `DDA_SUPPORTING_SIGNAL_${direction}`
      : `MODEL_SUPPORTING_SIGNAL_${direction}:${item.source}`;
  });
  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    verdict: "INCONCLUSIVE",
    confidenceBand: "unavailable",
    basis: conflicts.length > 0
      ? ["CONFLICTING_VERIFIED_PROVENANCE", ...(modelEnabled ? modelBasis : ["MODEL_POLICY_DISABLED"])]
      : [
          "NO_VERIFIED_AI_PROVENANCE",
          ...(modelEnabled ? modelBasis : ["MODEL_POLICY_DISABLED"]),
          "MISSING_DIRECT_EVIDENCE_IS_NEUTRAL",
        ],
    evidenceRefs: evidence.map((item) => item.id),
    conflicts,
    modelCoverage: modelEnabled ? "enabled" : "policy_disabled",
    policyVersion: ANALYSIS_POLICY_VERSION,
    decidedAt,
  };
}

export interface ProvenanceDecisionReplay {
  policyAvailable: boolean;
  matches: boolean;
  mismatchedFields: Array<keyof DecisionRecord>;
  originalDecision: DecisionRecord;
  replayedDecision?: DecisionRecord;
}

const REPLAY_FIELDS: Array<keyof DecisionRecord> = [
  "schemaVersion",
  "verdict",
  "confidenceBand",
  "basis",
  "evidenceRefs",
  "conflicts",
  "modelCoverage",
  "policyVersion",
  "decidedAt",
];

function replayFieldMatches(left: DecisionRecord[keyof DecisionRecord], right: DecisionRecord[keyof DecisionRecord]): boolean {
  return Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length && left.every((value, index) => value === right[index])
    : left === right;
}

export function replayProvenanceFirst(
  evidence: readonly EvidenceRecord[],
  originalDecision: DecisionRecord,
): ProvenanceDecisionReplay {
  if (originalDecision.policyVersion !== ANALYSIS_POLICY_VERSION) {
    return {
      policyAvailable: false,
      matches: false,
      mismatchedFields: ["policyVersion"],
      originalDecision: structuredClone(originalDecision),
    };
  }

  const replayedDecision = decideProvenanceFirst(
    [...evidence],
    originalDecision.decidedAt,
    originalDecision.modelCoverage === "enabled",
  );
  const mismatchedFields = REPLAY_FIELDS.filter((field) => !replayFieldMatches(originalDecision[field], replayedDecision[field]));
  return {
    policyAvailable: true,
    matches: mismatchedFields.length === 0,
    mismatchedFields,
    originalDecision: structuredClone(originalDecision),
    replayedDecision,
  };
}
