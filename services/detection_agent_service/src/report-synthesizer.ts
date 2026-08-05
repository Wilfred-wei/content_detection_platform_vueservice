import type { AgentConfig } from "./config.js";
import type { ClaimRecord, DecisionRecord, EvidenceRecord } from "./analysis-types.js";
import type { AiAuthenticityAssessmentRecord } from "./ai-authenticity-assessment.js";
import type { EngineFactory } from "./pi-engine.js";
import { REPORT_SYNTHESIS_TASK_TEMPLATE } from "./explanation-prompts.js";

const MAX_EVIDENCE_RECORDS = 64;
const MAX_FACTS_PER_RECORD = 32;
const MAX_TEXT_LENGTH = 512;
const MAX_SYNTHESIS_LENGTH = 4_000;

export interface ReportSynthesisInput {
  decision: DecisionRecord;
  provenanceConclusion?: DecisionRecord;
  aiAssessment?: AiAuthenticityAssessmentRecord;
  evidence: EvidenceRecord[];
  claims: ClaimRecord[];
  limitations: string[];
  correctionFeedback?: string[];
}

export interface ReportSynthesisResult {
  text: string;
  provider: string;
  model: string;
  generatedAt: string;
}

export interface ReportSynthesizer {
  synthesize(input: ReportSynthesisInput): Promise<ReportSynthesisResult>;
}

function cleanText(value: string, maximum = MAX_TEXT_LENGTH): string {
  return Array.from(value.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim())
    .slice(0, maximum)
    .join("");
}

function cleanFactValue(value: string | number | boolean | null): string | number | boolean | null {
  return typeof value === "string" ? cleanText(value) : value;
}

export function buildStructuredSynthesisContext(input: ReportSynthesisInput): Record<string, unknown> {
  const evidence = input.evidence.slice(0, MAX_EVIDENCE_RECORDS).map((record) => {
    const facts = Object.fromEntries(
      Object.entries(record.facts)
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(0, MAX_FACTS_PER_RECORD)
        .map(([key, value]) => [cleanText(key, 100), cleanFactValue(value)]),
    );

    if (record.source === "c2pa" && typeof facts.issuer === "string") {
      facts.claimedIssuer = facts.issuer;
      facts.issuerIdentityVerified = record.status === "verified_present" && facts.provenanceVerified === true;
      delete facts.issuer;
    }

    return {
      id: record.id,
      category: record.category,
      source: cleanText(record.source, 120),
      status: record.status,
      strength: record.strength,
      summary: cleanText(record.summary),
      facts,
    };
  });

  return {
    comprehensiveDecision: {
      verdict: input.decision.verdict,
      confidenceBand: input.decision.confidenceBand,
      basis: input.decision.basis.map((item) => cleanText(item)),
      evidenceRefs: [...input.decision.evidenceRefs],
      conflicts: input.decision.conflicts.map((item) => cleanText(item)),
      modelCoverage: input.decision.modelCoverage,
      policyVersion: input.decision.policyVersion,
    },
    provenanceConclusion: input.provenanceConclusion ? {
      verdict: input.provenanceConclusion.verdict,
      confidenceBand: input.provenanceConclusion.confidenceBand,
      basis: input.provenanceConclusion.basis.map((item) => cleanText(item)),
      evidenceRefs: [...input.provenanceConclusion.evidenceRefs],
      conflicts: input.provenanceConclusion.conflicts.map((item) => cleanText(item)),
      policyVersion: input.provenanceConclusion.policyVersion,
    } : null,
    aiAdjudication: input.aiAssessment?.final ? {
      status: input.aiAssessment.status,
      verdict: input.aiAssessment.final.verdict,
      confidenceBand: input.aiAssessment.final.confidenceBand,
      summary: cleanText(input.aiAssessment.final.summary),
      retainedReasonIds: [...input.aiAssessment.final.retainedReasonIds],
      rejectedReasonIds: [...input.aiAssessment.final.rejectedReasonIds],
      evidenceRefs: [...input.aiAssessment.final.evidenceRefs],
      counterEvidence: input.aiAssessment.final.counterEvidence.map((item) => cleanText(item)),
      conflicts: input.aiAssessment.reconciled.conflicts.map((item) => cleanText(item)),
      criticStatus: input.aiAssessment.criticStatus,
      criticDisposition: input.aiAssessment.critic?.disposition || null,
      promptBundle: {
        id: input.aiAssessment.promptBundle.id,
        version: input.aiAssessment.promptBundle.version,
        evaluationStatus: input.aiAssessment.promptBundle.evaluationStatus,
      },
    } : null,
    evidence,
    claims: input.claims.map((claim) => ({
      id: cleanText(claim.id, 160),
      type: claim.type,
      materiality: claim.materiality,
      statement: cleanText(claim.statement),
      evidenceRefs: [...claim.evidenceRefs],
    })),
    limitations: input.limitations.map((item) => cleanText(item)).slice(0, 24),
    ...(input.correctionFeedback?.length
      ? { correctionFeedback: input.correctionFeedback.map((item) => cleanText(item)).slice(0, 16) }
      : {}),
  };
}

export function buildSynthesisPrompt(input: ReportSynthesisInput): string {
  const context = buildStructuredSynthesisContext(input);
  return REPORT_SYNTHESIS_TASK_TEMPLATE.replace("{{STRUCTURED_CONTEXT}}", JSON.stringify(context));
}

export class PiReportSynthesizer implements ReportSynthesizer {
  constructor(
    private readonly config: AgentConfig,
    private readonly engineFactory: EngineFactory,
  ) {}

  async synthesize(input: ReportSynthesisInput): Promise<ReportSynthesisResult> {
    if (!this.config.providerReady) throw new Error("PI_PROVIDER_NOT_CONFIGURED");
    const engine = await this.engineFactory();
    try {
      const raw = await engine.prompt(buildSynthesisPrompt(input));
      const text = cleanText(raw, MAX_SYNTHESIS_LENGTH);
      if (!text) throw new Error("AI_SYNTHESIS_EMPTY");
      return {
        text,
        provider: this.config.provider,
        model: this.config.model,
        generatedAt: new Date().toISOString(),
      };
    } finally {
      engine.dispose();
    }
  }
}

export const unavailableReportSynthesizer: ReportSynthesizer = {
  async synthesize(): Promise<never> {
    throw new Error("PI_PROVIDER_NOT_CONFIGURED");
  },
};
