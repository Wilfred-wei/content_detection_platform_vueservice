import type { ForensicInspectionResult } from "./forensic-inspection.js";
import type { AiAuthenticityAssessmentRecord } from "./ai-authenticity-assessment.js";

export const ANALYSIS_SCHEMA_VERSION = "1.17.0";
export const ANALYSIS_POLICY_VERSION = "provenance-first-specialist-evidence-ai-adjudication-v2-2026-08-01";

export type AnalysisState = "queued" | "running" | "completed" | "failed" | "cancelled";
export type StageState = "pending" | "running" | "completed" | "skipped" | "policy_disabled" | "unavailable" | "failed";
export type EvidenceStatus =
  | "verified_present"
  | "possibly_present"
  | "detected"
  | "not_detected"
  | "policy_disabled"
  | "detector_unavailable"
  | "unsupported_format"
  | "unavailable"
  | "unsupported"
  | "invalid"
  | "error";
export type Verdict = "AI_GENERATED" | "LIKELY_NON_AI" | "INCONCLUSIVE";

export interface MediaAsset {
  schemaVersion: string;
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  width?: number;
  height?: number;
  storedPath: string;
  createdAt: string;
}

export interface AnalysisStage {
  id: "intake" | "watermark" | "metadata" | "multimodal_observation" | "ai_assessment" | "ai_counter_analysis" | "ai_final_adjudication" | "model_detection" | "decision" | "explanation" | "verification" | "localization";
  label: string;
  state: StageState;
  startedAt?: string;
  completedAt?: string;
  reason?: string;
}

export interface AnalysisPlanNode {
  stageId: AnalysisStage["id"];
  dependsOn: AnalysisStage["id"][];
  condition: string;
}

export interface ProgressEvent {
  schemaVersion: string;
  analysisId: string;
  sequence: number;
  scope: "analysis" | "stage";
  state: AnalysisState | StageState;
  stageId?: AnalysisStage["id"];
  reason?: string;
  createdAt: string;
}

export interface EvidenceRecord {
  schemaVersion: string;
  id: string;
  analysisId: string;
  category: "integrity" | "provenance" | "watermark" | "metadata" | "visual" | "model" | "localization";
  source: string;
  status: EvidenceStatus;
  strength: "strong" | "supporting" | "informational" | "none";
  summary: string;
  facts: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface DecisionRecord {
  schemaVersion: string;
  verdict: Verdict;
  confidenceBand: "high" | "medium" | "low" | "unavailable";
  basis: string[];
  evidenceRefs: string[];
  conflicts: string[];
  modelCoverage: "policy_disabled" | "enabled";
  policyVersion: string;
  decidedAt: string;
}

export type ClaimType = "verdict" | "provenance" | "metadata" | "visual" | "coverage" | "conflict" | "limitation";
export type ClaimMateriality = "material" | "supporting";

export interface ClaimRecord {
  schemaVersion: string;
  id: string;
  type: ClaimType;
  materiality: ClaimMateriality;
  statement: string;
  evidenceRefs: string[];
  authoritativeValue?: string;
}

export type ValidationOutcome = "supported" | "contradicted" | "unverifiable" | "not_applicable";

export interface ValidationCheck {
  id: string;
  passed: boolean;
  outcome: ValidationOutcome;
  method: "exact" | "semantic_positive" | "semantic_inverse" | "semantic_paraphrase" | "semantic_forced_choice";
  detail: string;
  question?: string;
  answer?: string;
}

export interface ValidationRecord {
  schemaVersion: string;
  status: "verified" | "fallback" | "failed" | "not_run";
  checks: ValidationCheck[];
  attempts: number;
  validator?: { provider: string; model: string };
  fallbackReason?: string;
  validatedAt: string;
}

export interface ExplanationSynthesisRecord {
  provider: string;
  model: string;
  promptBundle: {
    id: string;
    version: string;
    evaluationStatus: "prototype_not_calibrated";
    promptHashes: Record<string, string>;
  };
  generatedAt: string;
  attempts: number;
  outputType: "ai_synthesis" | "deterministic_fallback";
}

export interface AnalysisReport {
  schemaVersion: string;
  analysisId: string;
  directEvidencePolicyVersion: string;
  asset: Omit<MediaAsset, "storedPath">;
  productDecision: DecisionRecord;
  provenanceConclusion: DecisionRecord;
  /** Backward-compatible alias of provenanceConclusion. */
  decision: DecisionRecord;
  claims: ClaimRecord[];
  explanation: string;
  synthesis: ExplanationSynthesisRecord;
  validation: ValidationRecord;
  evidence: EvidenceRecord[];
  stages: AnalysisStage[];
  forensicInspection?: Omit<ForensicInspectionResult, "evidence">;
  aiAssessment?: AiAuthenticityAssessmentRecord;
  limitations: string[];
  sealed: true;
  createdAt: string;
}

export interface AnalysisRun {
  schemaVersion: string;
  id: string;
  idempotencyKey: string;
  directEvidencePolicyVersion: string;
  state: AnalysisState;
  stateVersion: number;
  /** Trusted gateway scope used for quota and tenant isolation; never part of the public report. */
  scope?: string;
  /** Queue lease that is allowed to append authoritative evidence. */
  leaseId?: string;
  cancelRequested?: boolean;
  assetDeletedAt?: string;
  tombstone?: { deletedAt: string; reason: "authorized_deletion" | "retention_expiry" };
  attempt: number;
  retryHistory: Array<{
    attempt: number;
    failedAt: string;
    error: { code: string; message: string; retryable: boolean };
  }>;
  options: { enableLocalization: boolean };
  asset: MediaAsset;
  stages: AnalysisStage[];
  executionPlan: AnalysisPlanNode[];
  progressEvents: ProgressEvent[];
  evidence: EvidenceRecord[];
  productDecision?: DecisionRecord;
  decision?: DecisionRecord;
  claims?: ClaimRecord[];
  explanation?: string;
  synthesis?: ExplanationSynthesisRecord;
  validation?: ValidationRecord;
  forensicInspection?: Omit<ForensicInspectionResult, "evidence">;
  aiAssessment?: AiAuthenticityAssessmentRecord;
  report?: AnalysisReport;
  error?: { code: string; message: string; retryable: boolean };
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisSubmission {
  filename: string;
  mimeType: string;
  dataBase64: string;
  idempotencyKey?: string;
  scope?: string;
  options?: { enableLocalization?: boolean };
}
