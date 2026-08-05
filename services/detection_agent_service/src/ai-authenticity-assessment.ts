import { readFile } from "node:fs/promises";

import type { AgentConfig } from "./config.js";
import type { EvidenceRecord, MediaAsset, Verdict } from "./analysis-types.js";
import type { VisualObservation } from "./forensic-inspection.js";
import type { EngineFactory, EngineImage } from "./pi-engine.js";
import { loadModelCandidateRegistry } from "./model-registry.js";
import {
  ACTIVE_AI_AUTHENTICITY_PROMPT_BUNDLE,
  AI_AUTHENTICITY_ADJUDICATION_TASK,
  AI_AUTHENTICITY_ASSESSMENT_TASK,
  AI_AUTHENTICITY_CRITIC_TASK,
} from "./ai-authenticity-prompts.js";

type ReasonDirection = "supports_ai" | "supports_non_ai" | "uncertain";
type ReasonStrength = "strong" | "moderate" | "weak";

export interface AiAssessmentReason {
  id: string;
  direction: ReasonDirection;
  claim: string;
  strength: ReasonStrength;
  observationRefs: string[];
  evidenceRefs: string[];
}

export interface DirectAiAssessment {
  verdict: Verdict;
  confidence: number;
  summary: string;
  reasons: AiAssessmentReason[];
  counterEvidence: string[];
  limitations: string[];
  imageInstructionDetected: boolean;
}

export interface AiAssessmentCritic {
  disposition: "SUSTAIN" | "CHALLENGE" | "ABSTAIN";
  summary: string;
  challengedReasonIds: string[];
  unsupportedReasonIds: string[];
  counterEvidence: string[];
  counterEvidenceRefs: string[];
  imageInstructionDetected: boolean;
}

export interface FinalAiAdjudication {
  verdict: Verdict;
  confidence: number;
  confidenceBand: "high" | "medium" | "low";
  summary: string;
  retainedReasonIds: string[];
  rejectedReasonIds: string[];
  evidenceRefs: string[];
  counterEvidence: string[];
  limitations: string[];
  conflicts: string[];
  imageInstructionDetected: boolean;
}

export interface ReconciledAiAssessment {
  authority: "probabilistic_ai_opinion";
  authenticatedProvenance: false;
  verdict: Verdict;
  confidence: number;
  confidenceBand: "high" | "medium" | "low" | "unavailable";
  status: "adjudicated" | "unavailable";
  summary: string;
  reasons: AiAssessmentReason[];
  evidenceRefs: string[];
  counterEvidence: string[];
  limitations: string[];
  conflicts: string[];
}

export interface AiAuthenticityAssessmentRecord {
  schemaVersion: "2.0.0";
  status: "completed" | "unavailable" | "failed";
  reason: string;
  promptBundle: typeof ACTIVE_AI_AUTHENTICITY_PROMPT_BUNDLE;
  provider: string;
  model: string;
  authority: "probabilistic_ai_opinion";
  direct?: DirectAiAssessment;
  critic?: AiAssessmentCritic;
  criticStatus: "completed" | "failed" | "skipped";
  criticReason?: string;
  final?: FinalAiAdjudication;
  /** Backward-compatible display projection of the final adjudication. */
  reconciled: ReconciledAiAssessment;
  assessedAt: string;
}

export interface AiAuthenticityAssessor {
  assess(asset: MediaAsset, observations: VisualObservation[], evidence: EvidenceRecord[]): Promise<AiAuthenticityAssessmentRecord>;
}

const VERDICTS = new Set<Verdict>(["AI_GENERATED", "LIKELY_NON_AI", "INCONCLUSIVE"]);

function object(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_AI_ASSESSMENT_OBJECT");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !fields.includes(key))) throw new Error("UNEXPECTED_AI_ASSESSMENT_FIELD");
  return record;
}

function text(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`INVALID_AI_ASSESSMENT_TEXT:${field}`);
  const clean = value.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean || Array.from(clean).length > maximum) throw new Error(`INVALID_AI_ASSESSMENT_TEXT:${field}`);
  return clean;
}

function stringArray(value: unknown, field: string, maximumItems: number, maximumText = 240): string[] {
  if (!Array.isArray(value) || value.length > maximumItems) throw new Error(`INVALID_AI_ASSESSMENT_ARRAY:${field}`);
  return value.map((item) => text(item, field, maximumText));
}

function probability(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error(`INVALID_AI_ASSESSMENT_PROBABILITY:${field}`);
  return Math.round(value * 100) / 100;
}

function json(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

export function parseDirectAiAssessment(
  raw: string,
  observationIds: ReadonlySet<string>,
  evidenceIds: ReadonlySet<string> = new Set(),
): DirectAiAssessment {
  const root = object(json(raw), ["verdict", "confidence", "summary", "reasons", "counterEvidence", "limitations", "imageInstructionDetected"]);
  if (!VERDICTS.has(root.verdict as Verdict)) throw new Error("INVALID_AI_ASSESSMENT_VERDICT");
  if (typeof root.imageInstructionDetected !== "boolean") throw new Error("INVALID_AI_ASSESSMENT_INJECTION_FLAG");
  if (!Array.isArray(root.reasons) || root.reasons.length > 6) throw new Error("INVALID_AI_ASSESSMENT_REASONS");
  const reasonIds = new Set<string>();
  const reasons = root.reasons.map((item, index): AiAssessmentReason => {
    const reason = object(item, ["id", "direction", "claim", "strength", "observationRefs", "evidenceRefs"]);
    const id = text(reason.id, `reasons.${index}.id`, 80);
    if (reasonIds.has(id)) throw new Error("DUPLICATE_AI_ASSESSMENT_REASON_ID");
    reasonIds.add(id);
    if (!["supports_ai", "supports_non_ai", "uncertain"].includes(String(reason.direction))) throw new Error("INVALID_AI_ASSESSMENT_DIRECTION");
    if (!["strong", "moderate", "weak"].includes(String(reason.strength))) throw new Error("INVALID_AI_ASSESSMENT_STRENGTH");
    const observationRefs = stringArray(reason.observationRefs, `reasons.${index}.observationRefs`, 8, 160);
    const evidenceRefs = stringArray(reason.evidenceRefs, `reasons.${index}.evidenceRefs`, 12, 160);
    if (observationRefs.some((id) => !observationIds.has(id))) throw new Error("UNKNOWN_AI_ASSESSMENT_OBSERVATION_REF");
    if (evidenceRefs.some((id) => !evidenceIds.has(id))) throw new Error("UNKNOWN_AI_ASSESSMENT_EVIDENCE_REF");
    return { id, direction: reason.direction as ReasonDirection, claim: text(reason.claim, `reasons.${index}.claim`, 240), strength: reason.strength as ReasonStrength, observationRefs, evidenceRefs };
  });
  if (root.verdict !== "INCONCLUSIVE" && !reasons.some((reason) => reason.direction === (root.verdict === "AI_GENERATED" ? "supports_ai" : "supports_non_ai"))) {
    throw new Error("AI_ASSESSMENT_VERDICT_WITHOUT_DIRECTIONAL_REASON");
  }
  return {
    verdict: root.verdict as Verdict,
    confidence: probability(root.confidence, "confidence"),
    summary: text(root.summary, "summary", 500),
    reasons,
    counterEvidence: stringArray(root.counterEvidence, "counterEvidence", 4),
    limitations: stringArray(root.limitations, "limitations", 4),
    imageInstructionDetected: root.imageInstructionDetected,
  };
}

export function parseAiAssessmentCritic(
  raw: string,
  candidateReasonIds: ReadonlySet<string>,
  evidenceIds: ReadonlySet<string> = new Set(),
): AiAssessmentCritic {
  const root = object(json(raw), ["disposition", "summary", "challengedReasonIds", "unsupportedReasonIds", "counterEvidence", "counterEvidenceRefs", "imageInstructionDetected"]);
  if (!["SUSTAIN", "CHALLENGE", "ABSTAIN"].includes(String(root.disposition))) throw new Error("INVALID_AI_CRITIC_DISPOSITION");
  if (typeof root.imageInstructionDetected !== "boolean") throw new Error("INVALID_AI_CRITIC_INJECTION_FLAG");
  const challengedReasonIds = stringArray(root.challengedReasonIds, "challengedReasonIds", 6, 80);
  const unsupportedReasonIds = stringArray(root.unsupportedReasonIds, "unsupportedReasonIds", 6, 80);
  const counterEvidenceRefs = stringArray(root.counterEvidenceRefs, "counterEvidenceRefs", 12, 160);
  if ([...challengedReasonIds, ...unsupportedReasonIds].some((id) => !candidateReasonIds.has(id))) throw new Error("UNKNOWN_AI_CRITIC_REASON_ID");
  if (counterEvidenceRefs.some((id) => !evidenceIds.has(id))) throw new Error("UNKNOWN_AI_CRITIC_EVIDENCE_REF");
  return {
    disposition: root.disposition as AiAssessmentCritic["disposition"],
    summary: text(root.summary, "summary", 500),
    challengedReasonIds,
    unsupportedReasonIds,
    counterEvidence: stringArray(root.counterEvidence, "counterEvidence", 4),
    counterEvidenceRefs,
    imageInstructionDetected: root.imageInstructionDetected,
  };
}

function band(confidence: number): ReconciledAiAssessment["confidenceBand"] {
  return confidence >= 0.8 ? "high" : confidence >= 0.6 ? "medium" : "low";
}

export function parseFinalAiAdjudication(
  raw: string,
  candidateReasonIds: ReadonlySet<string>,
  evidenceIds: ReadonlySet<string>,
  unsupportedReasonIds: ReadonlySet<string> = new Set(),
): FinalAiAdjudication {
  const root = object(json(raw), ["verdict", "confidence", "summary", "retainedReasonIds", "rejectedReasonIds", "evidenceRefs", "counterEvidence", "limitations", "conflicts", "imageInstructionDetected"]);
  if (!VERDICTS.has(root.verdict as Verdict)) throw new Error("INVALID_AI_ADJUDICATION_VERDICT");
  if (typeof root.imageInstructionDetected !== "boolean") throw new Error("INVALID_AI_ADJUDICATION_INJECTION_FLAG");
  const retainedReasonIds = stringArray(root.retainedReasonIds, "retainedReasonIds", 6, 80);
  const rejectedReasonIds = stringArray(root.rejectedReasonIds, "rejectedReasonIds", 6, 80);
  const evidenceRefs = stringArray(root.evidenceRefs, "evidenceRefs", 12, 160);
  if ([...retainedReasonIds, ...rejectedReasonIds].some((id) => !candidateReasonIds.has(id))) throw new Error("UNKNOWN_AI_ADJUDICATION_REASON_ID");
  if (retainedReasonIds.some((id) => rejectedReasonIds.includes(id) || unsupportedReasonIds.has(id))) throw new Error("INVALID_AI_ADJUDICATION_RETAINED_REASON");
  if (evidenceRefs.some((id) => !evidenceIds.has(id))) throw new Error("UNKNOWN_AI_ADJUDICATION_EVIDENCE_REF");
  if (root.verdict !== "INCONCLUSIVE" && retainedReasonIds.length === 0 && evidenceRefs.length === 0) {
    throw new Error("AI_ADJUDICATION_VERDICT_WITHOUT_EVIDENCE");
  }
  const confidence = probability(root.confidence, "confidence");
  return {
    verdict: root.verdict as Verdict,
    confidence,
    confidenceBand: band(confidence) as FinalAiAdjudication["confidenceBand"],
    summary: text(root.summary, "summary", 500),
    retainedReasonIds,
    rejectedReasonIds,
    evidenceRefs,
    counterEvidence: stringArray(root.counterEvidence, "counterEvidence", 6),
    limitations: stringArray(root.limitations, "limitations", 6),
    conflicts: stringArray(root.conflicts, "conflicts", 6),
    imageInstructionDetected: root.imageInstructionDetected,
  };
}

export function reconcileAiAssessment(
  direct: DirectAiAssessment,
  critic: AiAssessmentCritic | undefined,
  final: FinalAiAdjudication,
): ReconciledAiAssessment {
  const unsupported = new Set(critic?.unsupportedReasonIds || []);
  const retained = new Set(final.retainedReasonIds.filter((id) => !unsupported.has(id)));
  const conflicts = [...final.conflicts];
  if (direct.imageInstructionDetected || critic?.imageInstructionDetected || final.imageInstructionDetected) {
    conflicts.push("图像中存在指令性文本；所有阶段均将其作为不可信图像内容而非指令。");
  }
  if (critic?.unsupportedReasonIds.length) {
    conflicts.push(`独立质疑认为以下理由缺少充分依据，最终报告已抑制：${critic.unsupportedReasonIds.join("、")}。`);
  }
  if (critic?.disposition === "CHALLENGE") conflicts.push("独立质疑提出了理由级反证，已交由最终裁决器权衡。");
  return {
    authority: "probabilistic_ai_opinion",
    authenticatedProvenance: false,
    verdict: final.verdict,
    confidence: final.confidence,
    confidenceBand: final.confidenceBand,
    status: "adjudicated",
    summary: final.summary,
    reasons: direct.reasons.filter((reason) => retained.has(reason.id)),
    evidenceRefs: final.evidenceRefs,
    counterEvidence: [...new Set([...direct.counterEvidence, ...(critic?.counterEvidence || []), ...final.counterEvidence])].slice(0, 8),
    limitations: [...new Set([...direct.limitations, ...final.limitations, "综合结论属于概率性 AI 裁决，不等同于经过验证的来源凭证。"])].slice(0, 8),
    conflicts: [...new Set(conflicts)].slice(0, 8),
  };
}

function boundedFact(value: string | number | boolean | null): string | number | boolean | null {
  return typeof value === "string" ? Array.from(value).slice(0, 240).join("") : value;
}

function buildEvidenceContext(evidence: EvidenceRecord[]): Array<Record<string, unknown>> {
  const registrations = new Map(loadModelCandidateRegistry().candidates.map((candidate) => [candidate.id, candidate]));
  return evidence.slice(0, 64).map((record) => {
    const facts = Object.fromEntries(
      Object.entries(record.facts).slice(0, 24).map(([key, value]) => [key, boundedFact(value)]),
    );
    const candidate = record.category === "model" ? registrations.get(record.source) : undefined;
    return {
      id: record.id,
      category: record.category,
      source: record.source,
      status: record.status,
      strength: record.strength,
      summary: Array.from(record.summary).slice(0, 300).join(""),
      facts,
      ...(record.category === "model" ? {
        specialistDetector: {
          evidenceRole: "high_value_forensic_signal",
          applicability: candidate ? "registered_domain_profile_available_input_domain_unverified" : "comparison_or_coverage_record",
          score: typeof record.facts.score === "number" ? record.facts.score : null,
          threshold: typeof record.facts.threshold === "number" ? record.facts.threshold : null,
          predictedClass: typeof record.facts.predictedClass === "string" ? record.facts.predictedClass : null,
          calibrationStatus: typeof record.facts.calibrationStatus === "string" ? record.facts.calibrationStatus : candidate?.calibration.status || null,
          ...(candidate ? {
            signalFamily: candidate.signalFamily,
            trainingDomains: candidate.trainingDomains,
            scoreSemantics: candidate.outputSchema.scoreSemantics,
            thresholdSemantics: candidate.outputSchema.thresholdSemantics,
            runtimeEligibility: candidate.runtimeEligibility,
            productionEligibility: candidate.productionEligibility.status,
            knownLimitations: candidate.notes,
          } : {}),
        },
      } : {}),
    };
  });
}

function unavailable(reason: string, config: AgentConfig, status: "unavailable" | "failed" = "failed"): AiAuthenticityAssessmentRecord {
  return {
    schemaVersion: "2.0.0",
    status,
    reason,
    promptBundle: ACTIVE_AI_AUTHENTICITY_PROMPT_BUNDLE,
    provider: config.provider,
    model: config.model,
    authority: "probabilistic_ai_opinion",
    criticStatus: "skipped",
    reconciled: {
      authority: "probabilistic_ai_opinion",
      authenticatedProvenance: false,
      verdict: "INCONCLUSIVE",
      confidence: 0,
      confidenceBand: "unavailable",
      status: "unavailable",
      summary: "AI 视觉判断当前不可用。",
      reasons: [], evidenceRefs: [], counterEvidence: [], limitations: [reason], conflicts: [],
    },
    assessedAt: new Date().toISOString(),
  };
}

export class PiAiAuthenticityAssessor implements AiAuthenticityAssessor {
  constructor(
    private readonly config: AgentConfig,
    private readonly directFactory: EngineFactory,
    private readonly criticFactory: EngineFactory,
    private readonly adjudicatorFactory: EngineFactory,
  ) {}

  async assess(asset: MediaAsset, observations: VisualObservation[], evidence: EvidenceRecord[]): Promise<AiAuthenticityAssessmentRecord> {
    if (!this.config.providerReady) return unavailable("PI_PROVIDER_NOT_CONFIGURED", this.config, "unavailable");
    const image: EngineImage = { data: (await readFile(asset.storedPath)).toString("base64"), mimeType: asset.mimeType };
    const observationContext = observations.slice(0, 24).map(({ id, cueId, state, support, description, region }) => ({ id, cueId, state, support, description, region }));
    const evidenceContext = buildEvidenceContext(evidence);
    const evidenceIds = new Set(evidence.map((item) => item.id));
    let direct: DirectAiAssessment | undefined;
    try {
      const engine = await this.directFactory();
      try {
        const prompt = AI_AUTHENTICITY_ASSESSMENT_TASK.replace("{{CONTEXT}}", JSON.stringify({ observations: observationContext, detectorStates: evidenceContext }));
        direct = parseDirectAiAssessment(await engine.prompt(prompt, [image]), new Set(observations.map((item) => item.id)), evidenceIds);
      } finally { engine.dispose(); }
    } catch (error) {
      return unavailable(error instanceof Error ? error.message : "AI_DIRECT_ASSESSMENT_FAILED", this.config);
    }

    let critic: AiAssessmentCritic | undefined;
    let criticReason: string | undefined;
    try {
      const engine = await this.criticFactory();
      try {
        const prompt = AI_AUTHENTICITY_CRITIC_TASK.replace("{{CONTEXT}}", JSON.stringify({ candidate: direct, observations: observationContext, detectorStates: evidenceContext }));
        critic = parseAiAssessmentCritic(await engine.prompt(prompt, [image]), new Set(direct.reasons.map((item) => item.id)), evidenceIds);
      } finally { engine.dispose(); }
    } catch (error) {
      criticReason = error instanceof Error ? error.message : "AI_CRITIC_ASSESSMENT_FAILED";
    }

    try {
      const engine = await this.adjudicatorFactory();
      let final: FinalAiAdjudication;
      try {
        const prompt = AI_AUTHENTICITY_ADJUDICATION_TASK.replace("{{CONTEXT}}", JSON.stringify({
          candidate: direct,
          skepticalReview: critic || { status: "unavailable", reason: criticReason },
          observations: observationContext,
          evidence: evidenceContext,
        }));
        final = parseFinalAiAdjudication(
          await engine.prompt(prompt, [image]),
          new Set(direct.reasons.map((item) => item.id)),
          evidenceIds,
          new Set(critic?.unsupportedReasonIds || []),
        );
      } finally { engine.dispose(); }
      return {
        schemaVersion: "2.0.0",
        status: "completed",
        reason: critic ? "FINAL_AI_ADJUDICATION_COMPLETED" : "FINAL_AI_ADJUDICATION_COMPLETED_WITHOUT_CRITIC",
        promptBundle: ACTIVE_AI_AUTHENTICITY_PROMPT_BUNDLE,
        provider: this.config.provider,
        model: this.config.model,
        authority: "probabilistic_ai_opinion",
        direct,
        ...(critic ? { critic } : {}),
        criticStatus: critic ? "completed" : "failed",
        ...(criticReason ? { criticReason } : {}),
        final,
        reconciled: reconcileAiAssessment(direct, critic, final),
        assessedAt: new Date().toISOString(),
      };
    } catch (error) {
      const failed = unavailable(error instanceof Error ? error.message : "AI_FINAL_ADJUDICATION_FAILED", this.config);
      failed.direct = direct;
      if (critic) failed.critic = critic;
      failed.criticStatus = critic ? "completed" : "failed";
      if (criticReason) failed.criticReason = criticReason;
      failed.reconciled.summary = "AI 主判断已完成，但最终综合裁决未完成，未生成产品结论。";
      return failed;
    }
  }
}

export const unavailableAiAuthenticityAssessor: AiAuthenticityAssessor = {
  async assess(_asset, _observations, _evidence) {
    return {
      schemaVersion: "2.0.0", status: "unavailable", reason: "AI_AUTHENTICITY_ASSESSOR_NOT_CONFIGURED",
      promptBundle: ACTIVE_AI_AUTHENTICITY_PROMPT_BUNDLE, provider: "unconfigured", model: "unconfigured",
      authority: "probabilistic_ai_opinion",
      criticStatus: "skipped",
      reconciled: { authority: "probabilistic_ai_opinion", authenticatedProvenance: false, verdict: "INCONCLUSIVE", confidence: 0, confidenceBand: "unavailable", status: "unavailable", summary: "AI 视觉判断当前不可用。", reasons: [], evidenceRefs: [], counterEvidence: [], limitations: ["AI_AUTHENTICITY_ASSESSOR_NOT_CONFIGURED"], conflicts: [] },
      assessedAt: new Date().toISOString(),
    };
  },
};
