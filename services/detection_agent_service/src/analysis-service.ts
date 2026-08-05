import { createHash, randomUUID } from "node:crypto";

import { AnalysisStore } from "./analysis-store.js";
import {
  ANALYSIS_SCHEMA_VERSION,
  ANALYSIS_POLICY_VERSION,
  type AnalysisReport,
  type AnalysisRun,
  type AnalysisPlanNode,
  type AnalysisStage,
  type AnalysisSubmission,
  type DecisionRecord,
  type EvidenceRecord,
  type MediaAsset,
} from "./analysis-types.js";
import { decideProvenanceFirst } from "./decision-policy.js";
import {
  createAtomicClaims,
  deriveLimitations,
  deterministicFallbackExplanation,
  validateSynthesizedText,
} from "./explanation-policy.js";
import {
  type ExplanationVerifier,
  unavailableExplanationVerifier,
} from "./explanation-verifier.js";
import { ACTIVE_EXPLANATION_PROMPT_BUNDLE } from "./explanation-prompts.js";
import { collectClosedVerifierCoverage } from "./closed-verifier-adapters.js";
import {
  c2paInspectionToEvidence,
  createConfiguredC2paInspector,
  type C2paInspection,
  type C2paInspector,
} from "./c2pa-inspector.js";
import { inspectImage } from "./image-inspection.js";
import {
  LocalMetadataInspector,
  metadataInspectionToEvidence,
  type MetadataInspection,
  type MetadataInspector,
} from "./metadata-inspector.js";
import {
  createConfiguredWatermarkInspector,
  type WatermarkInspector,
} from "./watermark-adapters.js";
import {
  type ReportSynthesizer,
  unavailableReportSynthesizer,
} from "./report-synthesizer.js";
import {
  type ForensicInspector,
  unavailableForensicInspector,
} from "./forensic-inspection.js";
import {
  type AiAuthenticityAssessor,
  type AiAuthenticityAssessmentRecord,
  unavailableAiAuthenticityAssessor,
} from "./ai-authenticity-assessment.js";
import {
  modelDetectorFailureToEvidence,
  modelDetectionToEvidence,
  type ModelDetectionResult,
  type ModelDetector,
  unavailableModelDetector,
} from "./model-detector.js";
import {
  ACTIVE_DIRECT_EVIDENCE_POLICY,
  runDirectEvidenceCollector,
  type DirectEvidencePolicy,
  validateDirectEvidencePolicy,
} from "./direct-evidence-policy.js";
import {
  applyProvenanceShortCircuitGate,
  type ProvenanceShortCircuitResolver,
  resolveProvenanceShortCircuit,
} from "./provenance-registry.js";
import {
  InProcessAnalysisScheduler,
  type AnalysisQueueStats,
  type AnalysisScheduler,
} from "./analysis-queue.js";
import type { ModelRuntimeInfo } from "./model-detector.js";
import { NoopObservability, type Observability } from "./observability.js";
import {
  loadModelCascadePolicy,
  planModelCascade,
  shouldEscalateModelCascade,
  type ModelCascadePolicy,
} from "./model-cascade.js";
import { ModelResourceScheduler } from "./model-resource-scheduler.js";
import { loadModelDriftPolicy, ModelDriftMonitor } from "./model-drift-monitor.js";

const STAGES: AnalysisStage[] = [
  { id: "intake", label: "接收与校验", state: "pending" },
  { id: "watermark", label: "水印与来源凭证", state: "pending" },
  { id: "metadata", label: "元数据检查", state: "pending" },
  { id: "multimodal_observation", label: "多模态视觉调查", state: "pending" },
  { id: "ai_assessment", label: "AI 直接判断", state: "pending" },
  { id: "ai_counter_analysis", label: "AI 理由质疑", state: "pending" },
  { id: "ai_final_adjudication", label: "AI 最终裁决", state: "pending" },
  { id: "localization", label: "条件定位", state: "pending" },
  { id: "model_detection", label: "检测模型", state: "pending" },
  { id: "decision", label: "证据决策", state: "pending" },
  { id: "explanation", label: "解释生成", state: "pending" },
  { id: "verification", label: "解释复核", state: "pending" },
];
const MAX_ANALYSIS_ATTEMPTS = 3;

function buildExecutionPlan(enableLocalization: boolean, modelEnabled: boolean): AnalysisPlanNode[] {
  return [
    { stageId: "intake", dependsOn: [], condition: "always" },
    { stageId: "watermark", dependsOn: ["intake"], condition: "asset_supported" },
    { stageId: "metadata", dependsOn: ["intake"], condition: "asset_supported" },
    { stageId: "model_detection", dependsOn: ["watermark", "metadata"], condition: modelEnabled ? "unresolved_and_detector_available" : "policy_disabled" },
    { stageId: "multimodal_observation", dependsOn: ["watermark", "metadata", "model_detection"], condition: "unresolved_and_provider_available" },
    { stageId: "ai_assessment", dependsOn: ["multimodal_observation"], condition: "unresolved_and_provider_available" },
    { stageId: "ai_counter_analysis", dependsOn: ["ai_assessment"], condition: "direct_assessment_available" },
    { stageId: "ai_final_adjudication", dependsOn: ["ai_counter_analysis"], condition: "direct_assessment_available" },
    { stageId: "localization", dependsOn: ["multimodal_observation"], condition: enableLocalization ? "requested_and_supported_visual_claim" : "disabled" },
    { stageId: "decision", dependsOn: ["watermark", "metadata", "multimodal_observation", "ai_final_adjudication", "localization", "model_detection"], condition: "evidence_barrier_reached" },
    { stageId: "explanation", dependsOn: ["decision"], condition: "decision_available" },
    { stageId: "verification", dependsOn: ["explanation"], condition: "explanation_available" },
  ];
}

function now(): string { return new Date().toISOString(); }

export interface ProductionDecisionGate {
  authorized: boolean;
  reason: string;
}

const PROTOTYPE_DECISION_GATE: ProductionDecisionGate = Object.freeze({
  authorized: true,
  reason: "prototype_or_test_runtime",
});

function comprehensiveDecision(
  provenanceConclusion: DecisionRecord,
  assessment: AiAuthenticityAssessmentRecord | undefined,
  decidedAt: string,
): DecisionRecord {
  if (!assessment?.final || assessment.reconciled.status !== "adjudicated") return provenanceConclusion;
  const retained = new Set(assessment.final.retainedReasonIds);
  const reasonEvidenceRefs = assessment.direct?.reasons
    .filter((reason) => retained.has(reason.id))
    .flatMap((reason) => reason.evidenceRefs) || [];
  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    verdict: assessment.final.verdict,
    confidenceBand: assessment.final.confidenceBand,
    basis: ["AI_FINAL_MULTIMODAL_ADJUDICATION", "SPECIALIST_DETECTOR_EVIDENCE", "IMAGE_GROUNDED_ASSESSMENT"],
    evidenceRefs: [...new Set([...assessment.final.evidenceRefs, ...reasonEvidenceRefs])],
    conflicts: [...assessment.reconciled.conflicts],
    modelCoverage: provenanceConclusion.modelCoverage,
    policyVersion: `${ANALYSIS_POLICY_VERSION}:${assessment.promptBundle.id}@${assessment.promptBundle.version}`,
    decidedAt,
  };
}

/**
 * Keep the probabilistic opinion for audit and explanation, but do not expose
 * it as a production label until the immutable accuracy policy is promoted.
 * Verified provenance remains authoritative through the provenance-first path.
 */
export function applyProductionDecisionGate(
  candidate: DecisionRecord,
  provenanceConclusion: DecisionRecord,
  gate: ProductionDecisionGate,
  decidedAt = candidate.decidedAt,
): DecisionRecord {
  if (gate.authorized || candidate.verdict === "INCONCLUSIVE") return candidate;
  const authenticatedProvenance = provenanceConclusion.basis.some((basis) => basis.startsWith("VERIFIED_PROVENANCE:"));
  if (authenticatedProvenance) return candidate;
  return {
    ...candidate,
    verdict: "INCONCLUSIVE",
    confidenceBand: "unavailable",
    basis: [...candidate.basis, "PRODUCTION_ACCURACY_GATE_BLOCKED"],
    conflicts: [...candidate.conflicts, `PRODUCTION_LABELING_GATE:${gate.reason}`],
    policyVersion: `${candidate.policyVersion}:production-label-gate`,
    decidedAt,
  };
}

export class AnalysisService {
  private readonly modelDetectors: readonly ModelDetector[];
  private readonly executionAssets = new Map<string, MediaAsset>();
  private readonly modelCascadePolicy: ModelCascadePolicy;
  private readonly modelResourceScheduler: ModelResourceScheduler;
  private readonly modelDriftMonitor: ModelDriftMonitor;
  private readonly scheduler: AnalysisScheduler;
  private readonly observability: Observability;

  constructor(
    private readonly store: AnalysisStore,
    private readonly maxImageBytes: number,
    private readonly reportSynthesizer: ReportSynthesizer = unavailableReportSynthesizer,
    private readonly explanationVerifier: ExplanationVerifier = unavailableExplanationVerifier,
    private readonly c2paInspector: C2paInspector = createConfiguredC2paInspector(),
    private readonly metadataInspector: MetadataInspector = new LocalMetadataInspector(),
    private readonly watermarkInspector: WatermarkInspector = createConfiguredWatermarkInspector(),
    private readonly forensicInspector: ForensicInspector = unavailableForensicInspector,
    private readonly aiAuthenticityAssessor: AiAuthenticityAssessor = unavailableAiAuthenticityAssessor,
    modelDetectors: ModelDetector | readonly ModelDetector[] = unavailableModelDetector,
    private readonly directEvidencePolicy: DirectEvidencePolicy = ACTIVE_DIRECT_EVIDENCE_POLICY,
    private readonly provenanceShortCircuitResolver: ProvenanceShortCircuitResolver = resolveProvenanceShortCircuit,
    scheduler: AnalysisScheduler = new InProcessAnalysisScheduler(),
    observability: Observability = new NoopObservability(),
    modelCascadePolicy: ModelCascadePolicy = loadModelCascadePolicy(),
    modelResourceScheduler: ModelResourceScheduler = new ModelResourceScheduler(),
    modelDriftMonitor: ModelDriftMonitor = new ModelDriftMonitor(loadModelDriftPolicy()),
    private readonly productionDecisionGate: ProductionDecisionGate = PROTOTYPE_DECISION_GATE,
  ) {
    validateDirectEvidencePolicy(directEvidencePolicy);
    this.modelDetectors = Array.isArray(modelDetectors) ? modelDetectors : [modelDetectors as ModelDetector];
    this.modelCascadePolicy = modelCascadePolicy;
    this.modelResourceScheduler = modelResourceScheduler;
    this.modelDriftMonitor = modelDriftMonitor;
    for (const detector of this.modelDetectors) {
      const runtime = detector.runtimeInfo?.();
      if (!runtime) continue;
      this.modelResourceScheduler.register({
        modelId: detector.id,
        device: runtime.device,
        resourceClass: runtime.resourceClass,
        memoryReservationMb: runtime.memoryReservationMb ?? null,
        slots: runtime.slotCount ?? 1,
        maxQueue: runtime.maxQueue ?? 1,
        microbatchSize: runtime.microbatchSize,
        maxBatchDelayMs: runtime.maxBatchDelayMs ?? 0,
        residency: runtime.residency === "process_scoped" ? "resident" : "ephemeral",
      });
    }
    this.scheduler = scheduler;
    this.observability = observability;
    this.scheduler.start(
      (analysisId, leaseId) => this.execute(analysisId, undefined, leaseId),
      (analysisId) => this.expireQueued(analysisId),
    );
  }

  private enabledModelDetectors(): readonly ModelDetector[] {
    return this.modelDetectors.filter((detector) => detector.enabled);
  }

  private async runModelDetector(analysis: AnalysisRun, detector: ModelDetector): Promise<{ ok: true; detector: ModelDetector; modelResult: ModelDetectionResult } | { ok: false; detector: ModelDetector; error: unknown }> {
    const detectorStartedAt = Date.now();
    const runtime = detector.runtimeInfo?.();
    this.observability.record({ timestamp: now(), type: "detector.started", analysisId: analysis.id, scope: analysis.scope, details: { detectorId: detector.id, device: runtime?.device || "unknown", resourceClass: runtime?.resourceClass || "unknown" } });
    try {
      const asset = this.executionAssets.get(analysis.id) || analysis.asset;
      const modelResult = await this.modelResourceScheduler.runBatched(
        detector.id,
        asset,
        () => detector.detect(asset),
        detector.detectBatch
          ? async (assets) => detector.detectBatch!(assets)
          : undefined,
      );
      this.modelDriftMonitor.observe({
        detectorId: detector.id,
        score: modelResult.score,
        outcome: modelResult.outcome,
        outOfDistribution: modelResult.diagnostics.outOfDistribution === true ? true : modelResult.diagnostics.outOfDistribution === false ? false : null,
        timestamp: now(),
      });
      this.observability.record({ timestamp: now(), type: "detector.completed", analysisId: analysis.id, scope: analysis.scope, durationMs: Date.now() - detectorStartedAt, details: { detectorId: detector.id, outcome: modelResult.outcome, device: runtime?.device || "unknown" } });
      return { ok: true, detector, modelResult };
    } catch (error) {
      this.observability.record({ timestamp: now(), type: "detector.failed", analysisId: analysis.id, scope: analysis.scope, durationMs: Date.now() - detectorStartedAt, code: error instanceof Error ? error.message.split(":", 1)[0] : "DETECTOR_FAILED", details: { detectorId: detector.id } });
      return { ok: false, detector, error };
    }
  }

  submit(input: AnalysisSubmission): { analysis: AnalysisRun; reused: boolean } {
    const normalized = this.validateSubmission(input);
    const existing = this.store.findByIdempotencyKey(normalized.idempotencyKey);
    if (existing) return { analysis: existing, reused: true };

    const facts = inspectImage(normalized.bytes);
    if (normalized.mimeType && normalized.mimeType !== facts.mimeType) throw new Error("IMAGE_TYPE_MISMATCH");
    const createdAt = now();
    const assetId = randomUUID();
    const storedPath = this.store.writeAsset(assetId, normalized.bytes);
    const analysis: AnalysisRun = {
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      id: randomUUID(),
      idempotencyKey: normalized.idempotencyKey,
      directEvidencePolicyVersion: this.directEvidencePolicy.policyVersion,
      state: "queued",
      stateVersion: 1,
      scope: normalized.scope,
      attempt: 1,
      retryHistory: [],
      options: { enableLocalization: input.options?.enableLocalization === true },
      asset: {
        schemaVersion: ANALYSIS_SCHEMA_VERSION,
        id: assetId,
        filename: normalized.filename,
        mimeType: facts.mimeType,
        sizeBytes: normalized.bytes.length,
        sha256: createHash("sha256").update(normalized.bytes).digest("hex"),
        width: facts.width,
        height: facts.height,
        storedPath,
        createdAt,
      },
      stages: structuredClone(STAGES),
      executionPlan: buildExecutionPlan(input.options?.enableLocalization === true, this.enabledModelDetectors().length > 0),
      progressEvents: [{ schemaVersion: ANALYSIS_SCHEMA_VERSION, analysisId: "", sequence: 1, scope: "analysis", state: "queued", createdAt }],
      evidence: [],
      createdAt,
      updatedAt: createdAt,
    };
    analysis.progressEvents[0].analysisId = analysis.id;
    this.store.save(analysis);
    this.observability.record({ timestamp: createdAt, type: "analysis.submitted", analysisId: analysis.id, scope: analysis.scope, details: { sizeBytes: analysis.asset.sizeBytes } });
    try {
      this.scheduler.enqueue(analysis.id, analysis.scope);
    } catch (error) {
      analysis.state = "failed";
      analysis.stateVersion += 1;
      analysis.error = {
        code: error instanceof Error && error.message === "ANALYSIS_QUEUE_OVERLOADED" ? "ANALYSIS_QUEUE_OVERLOADED" : "ANALYSIS_QUEUE_UNAVAILABLE",
        message: error instanceof Error ? error.message : "Analysis queue unavailable.",
        retryable: true,
      };
      analysis.updatedAt = now();
      this.progress(analysis, "analysis", "failed", undefined, analysis.error.message);
      this.store.save(analysis);
      this.store.deleteAsset(assetId);
      this.observability.record({ timestamp: now(), type: "analysis.queue_rejected", analysisId: analysis.id, code: analysis.error.code });
      throw error;
    }
    return { analysis, reused: false };
  }

  get(id: string): AnalysisRun {
    const analysis = this.store.get(id);
    if (!analysis) throw new Error("ANALYSIS_NOT_FOUND");
    return analysis;
  }

  evidence(id: string): EvidenceRecord[] { return this.get(id).evidence; }

  getProgress(id: string, cursor = 0): { analysisId: string; cursor: number; nextCursor: number; events: AnalysisRun["progressEvents"]; terminal: boolean } {
    const analysis = this.get(id);
    const normalizedCursor = Number.isFinite(cursor) && cursor >= 0 ? Math.floor(cursor) : 0;
    const events = analysis.progressEvents.filter((event) => event.sequence > normalizedCursor);
    return {
      analysisId: id,
      cursor: normalizedCursor,
      nextCursor: analysis.progressEvents.at(-1)?.sequence || normalizedCursor,
      events,
      terminal: ["completed", "failed", "cancelled"].includes(analysis.state),
    };
  }

  queueStats(): AnalysisQueueStats { return this.scheduler.stats(); }

  modelRuntime(): ModelRuntimeInfo[] {
    return this.modelDetectors.map((detector) => detector.runtimeInfo?.() || {
      detectorId: detector.id,
      enabled: detector.enabled,
      device: "unknown",
      residency: detector.enabled ? "unknown" : "not_loaded",
      admission: detector.enabled ? "unknown" : "not_configured",
      maxQueue: null,
      microbatchSize: 1,
      resourceClass: "unknown",
    });
  }

  modelResourceStats() {
    return this.modelResourceScheduler.stats();
  }

  modelResourceDeviceStats() {
    return this.modelResourceScheduler.deviceStats();
  }

  metrics(): { queue: AnalysisQueueStats; modelResources: ReturnType<ModelResourceScheduler["stats"]>; modelDevices: ReturnType<ModelResourceScheduler["deviceStats"]>; drift: ReturnType<ModelDriftMonitor["snapshot"]>; observability: ReturnType<Observability["snapshot"]> } {
    return { queue: this.scheduler.stats(), modelResources: this.modelResourceScheduler.stats(), modelDevices: this.modelResourceScheduler.deviceStats(), drift: this.modelDriftMonitor.snapshot(), observability: this.observability.snapshot() };
  }

  cancel(id: string): AnalysisRun {
    this.scheduler.cancel(id);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const analysis = this.get(id);
      if (["completed", "failed", "cancelled"].includes(analysis.state) || analysis.report?.sealed) {
        throw new Error("ANALYSIS_NOT_CANCELLABLE");
      }
      analysis.cancelRequested = true;
      analysis.state = "cancelled";
      analysis.stateVersion += 1;
      analysis.updatedAt = now();
      this.progress(analysis, "analysis", "cancelled", undefined, "用户或上游请求取消分析。");
      try {
        this.store.save(analysis);
        this.observability.record({ timestamp: analysis.updatedAt, type: "analysis.cancelled", analysisId: id, scope: analysis.scope });
        return this.get(id);
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "STATE_VERSION_CONFLICT") throw error;
      }
    }
    throw new Error("STATE_VERSION_CONFLICT");
  }

  deleteAsset(id: string): AnalysisRun {
    const analysis = this.get(id);
    if (analysis.state === "running" || analysis.state === "queued") throw new Error("ASSET_DELETE_WHILE_RUNNING");
    if (!analysis.assetDeletedAt) {
      this.store.deleteAsset(analysis.asset.id);
      analysis.assetDeletedAt = now();
      analysis.tombstone = { deletedAt: analysis.assetDeletedAt, reason: "authorized_deletion" };
      analysis.stateVersion += 1;
      analysis.updatedAt = analysis.assetDeletedAt;
      this.store.save(analysis);
    }
    return this.get(id);
  }

  pruneExpired(retentionMs: number, referenceTime = Date.now()): number {
    if (!Number.isFinite(retentionMs) || retentionMs <= 0) return 0;
    let deleted = 0;
    for (const analysis of this.store.list()) {
      if (analysis.assetDeletedAt || !["completed", "failed", "cancelled"].includes(analysis.state)) continue;
      const updatedAt = Date.parse(analysis.updatedAt);
      if (!Number.isFinite(updatedAt) || updatedAt + retentionMs > referenceTime) continue;
      try {
        this.store.deleteAsset(analysis.asset.id);
        const deletedAt = new Date(referenceTime).toISOString();
        analysis.assetDeletedAt = deletedAt;
        analysis.tombstone = { deletedAt, reason: "retention_expiry" };
        analysis.stateVersion += 1;
        analysis.updatedAt = deletedAt;
        this.store.save(analysis);
        this.observability.record({ timestamp: deletedAt, type: "asset.retention_deleted", analysisId: analysis.id, scope: analysis.scope });
        deleted += 1;
      } catch {
        // A concurrent authorized delete or terminal writer is harmless.
      }
    }
    return deleted;
  }

  report(id: string): AnalysisReport {
    const analysis = this.get(id);
    if (!analysis.report) throw new Error("REPORT_NOT_READY");
    return analysis.report;
  }

  asset(id: string): { path: string; mimeType: string; sizeBytes: number } {
    const analysis = this.get(id);
    if (analysis.assetDeletedAt) throw new Error("ASSET_DELETED");
    return {
      path: analysis.asset.storedPath,
      mimeType: analysis.asset.mimeType,
      sizeBytes: analysis.asset.sizeBytes,
    };
  }

  assetBytes(id: string): Buffer {
    const analysis = this.get(id);
    if (analysis.assetDeletedAt) throw new Error("ASSET_DELETED");
    return this.store.readAsset(analysis.asset.id);
  }

  retry(id: string): AnalysisRun {
    const prior = this.get(id);
    const attempt = prior.attempt || 1;
    if (prior.state !== "failed" || prior.error?.retryable !== true || attempt >= MAX_ANALYSIS_ATTEMPTS || prior.report?.sealed) {
      throw new Error("ANALYSIS_NOT_RETRYABLE");
    }
    const failedAt = prior.updatedAt;
    prior.retryHistory ??= [];
    prior.retryHistory.push({ attempt, failedAt, error: { ...prior.error } });
    prior.attempt = attempt + 1;
    prior.state = "queued";
    prior.stateVersion += 1;
    prior.updatedAt = now();
    prior.stages = structuredClone(STAGES);
    prior.executionPlan = buildExecutionPlan(prior.options?.enableLocalization === true, this.enabledModelDetectors().length > 0);
    prior.evidence = [];
    delete prior.decision;
    delete prior.productDecision;
    delete prior.claims;
    delete prior.explanation;
    delete prior.synthesis;
    delete prior.validation;
    delete prior.forensicInspection;
    delete prior.aiAssessment;
    delete prior.report;
    delete prior.error;
    this.progress(prior, "analysis", "queued", undefined, `RETRY_ATTEMPT_${prior.attempt}`);
    this.store.save(prior);
    const enableLocalization = prior.options?.enableLocalization === true
      || prior.executionPlan.find((node) => node.stageId === "localization")?.condition === "requested_and_supported_visual_claim";
    try {
      this.scheduler.enqueue(prior.id, prior.scope);
    } catch (error) {
      prior.state = "failed";
      prior.stateVersion += 1;
      prior.error = {
        code: error instanceof Error && error.message === "ANALYSIS_QUEUE_OVERLOADED" ? "ANALYSIS_QUEUE_OVERLOADED" : "ANALYSIS_QUEUE_UNAVAILABLE",
        message: error instanceof Error ? error.message : "Analysis queue unavailable.",
        retryable: true,
      };
      prior.updatedAt = now();
      this.progress(prior, "analysis", "failed", undefined, prior.error.message);
      this.store.save(prior);
      this.observability.record({ timestamp: prior.updatedAt, type: "analysis.queue_rejected", analysisId: prior.id, scope: prior.scope, code: prior.error.code });
      throw error;
    }
    return this.get(prior.id);
  }

  private async execute(id: string, enableLocalization?: boolean, leaseId?: string): Promise<void> {
    const analysis = this.get(id);
    const localizationEnabled = enableLocalization ?? analysis.options?.enableLocalization === true;
    let materialized: ReturnType<AnalysisStore["materializeAsset"]> | undefined;
    try {
      materialized = this.store.materializeAsset(analysis.asset.id);
      this.executionAssets.set(id, { ...analysis.asset, storedPath: materialized.path });
      this.assertWritable(analysis, leaseId);
      if (leaseId) {
        analysis.leaseId = leaseId;
      }
      analysis.state = "running";
      analysis.stateVersion += 1;
      analysis.updatedAt = now();
      this.progress(analysis, "analysis", "running");
      this.store.save(analysis);
      this.observability.record({ timestamp: analysis.updatedAt, type: "analysis.started", analysisId: id, scope: analysis.scope });
      this.transition(analysis, "intake", "completed");
      analysis.evidence.push(this.evidenceRecord(analysis.id, "integrity", "sha256", "detected", "informational", "原始文件哈希已固定。", { sha256: analysis.asset.sha256 }));

      this.transition(analysis, "watermark", "running", "正在按直接证据策略并发执行 C2PA 与注册表启用的本地水印解码器。");
      this.transition(analysis, "metadata", "running", "正在并发解析 EXIF、XMP、IPTC 与 GB 45438-2025 AIGC 字段。");
      const [c2paInspection, watermarkEvidence, metadataInspection] = await Promise.all([
        runDirectEvidenceCollector(
          "c2pa",
          this.directEvidencePolicy,
          () => this.c2paInspector.inspect(this.executionAssets.get(id)!.storedPath, analysis.asset.mimeType),
          (error): C2paInspection => ({ outcome: "error", validationStatusCount: 0, reason: error.message }),
        ),
        runDirectEvidenceCollector(
          "registered_watermarks",
          this.directEvidencePolicy,
          () => this.watermarkInspector.inspect(analysis.id, this.executionAssets.get(id)!, now()),
          (error): EvidenceRecord[] => [this.evidenceRecord(
            analysis.id,
            "watermark",
            "direct-evidence-barrier:registered-watermarks",
            "error",
            "none",
            "注册水印检测未在直接证据完成屏障截止时间内形成结果，不能解释为未发现水印。",
            {
              detectionAttempted: true,
              absenceEstablished: false,
              errorCode: error.message.split(":", 1)[0],
            },
          )],
        ),
        runDirectEvidenceCollector(
          "metadata",
          this.directEvidencePolicy,
          () => this.metadataInspector.inspect(this.executionAssets.get(id)!.storedPath, analysis.asset.mimeType),
          (error): MetadataInspection => ({
            outcome: "error",
            segments: { exif: false, xmp: false, iptc: false },
            fieldCount: 0,
            traversalTruncated: false,
            gpsExcluded: true,
            aigc: { outcome: "absent", markerCount: 0, authenticated: false, violationCount: 0 },
            reason: error.message,
          }),
        ),
      ]);
      const stampPolicy = (record: EvidenceRecord): EvidenceRecord => ({
        ...record,
        facts: {
          ...record.facts,
          directEvidencePolicyVersion: this.directEvidencePolicy.policyVersion,
          completionBarrier: this.directEvidencePolicy.barrier,
        },
      });
      analysis.evidence.push(stampPolicy(applyProvenanceShortCircuitGate(
        c2paInspectionToEvidence(analysis.id, c2paInspection, now()),
        this.provenanceShortCircuitResolver,
      )));
      analysis.evidence.push(...watermarkEvidence.map((record) => stampPolicy(applyProvenanceShortCircuitGate(
        record,
        this.provenanceShortCircuitResolver,
      ))));
      analysis.evidence.push(...collectClosedVerifierCoverage(analysis.id, now()).map(stampPolicy));
      analysis.evidence.push(...metadataInspectionToEvidence(analysis.id, metadataInspection, now()).map(stampPolicy));
      this.transition(
        analysis,
        "watermark",
        c2paInspection.outcome === "unavailable" ? "unavailable" : "completed",
        c2paInspection.outcome === "unavailable"
          ? "本地 C2PA 运行时不可用；开放水印解码结果已按各自状态保留。"
          : `C2PA 与注册水印均已进入终态，直接证据完成屏障已关闭（${this.directEvidencePolicy.policyVersion}）。`,
      );

      this.transition(
        analysis,
        "metadata",
        metadataInspection.outcome === "error" ? "failed" : metadataInspection.outcome === "unsupported" ? "unavailable" : "completed",
        metadataInspection.outcome === "error"
          ? "元数据解析失败，已保留错误状态并继续保守决策。"
          : metadataInspection.outcome === "unsupported"
            ? "该格式暂不支持结构化元数据解析。"
            : "元数据解析与 AIGC 字段校验已完成。",
      );

      const enabledModelDetectors = this.enabledModelDetectors();
      const modelEnabled = enabledModelDetectors.length > 0;
      const directEvidenceDecision = decideProvenanceFirst(analysis.evidence, now(), modelEnabled);
      if (directEvidenceDecision.verdict === "AI_GENERATED") {
        this.transition(analysis, "model_detection", "skipped", "已取得足够的强来源证据，按策略不再调用概率模型。");
        enabledModelDetectors.forEach((detector) => {
          analysis.evidence.push(this.evidenceRecord(
            analysis.id,
            "model",
            detector.id,
            "unavailable",
            "none",
            `${detector.id} 已启用，但因强来源证据触发短路而未执行。`,
            { policyEnabled: true, detectionAttempted: false, reason: "strong_provenance_short_circuit" },
          ));
        });
        this.transition(analysis, "multimodal_observation", "skipped", "已取得足够的强来源证据，策略停止调度支持性的多模态视觉调查。");
        this.transition(analysis, "ai_assessment", "skipped", "已取得足够的强来源证据，不再调用概率性的 AI 视觉判断。");
        this.transition(analysis, "ai_counter_analysis", "skipped", "AI 视觉判断未运行，因此无需独立质疑。");
        this.transition(analysis, "ai_final_adjudication", "skipped", "已由强来源证据完成判定，无需概率性 AI 裁决。");
        this.transition(analysis, "localization", "skipped", localizationEnabled ? "强来源证据已完成判定，不再调度支持性的条件定位。" : "用户未请求条件定位。");
      } else {
        if (modelEnabled) {
          const cascadePlan = planModelCascade(enabledModelDetectors, this.modelCascadePolicy);
          this.transition(analysis, "model_detection", "running", `先执行主模型 ${cascadePlan.primary?.id || "--"}，按版本化级联策略决定是否升级互补模型；各结果仅作为独立支持性证据。`);
          const completed: string[] = [];
          const unavailable: string[] = [];
          const modelResults: ModelDetectionResult[] = [];
          const detectorOutcomes: Array<Awaited<ReturnType<AnalysisService["runModelDetector"]>>> = [];
          if (cascadePlan.primary) detectorOutcomes.push(await this.runModelDetector(analysis, cascadePlan.primary));
          const primaryOutcome = detectorOutcomes[0];
          const primaryResult = primaryOutcome?.ok ? primaryOutcome.modelResult : undefined;
          const escalation = shouldEscalateModelCascade(primaryResult, this.modelCascadePolicy);
          const scheduledComplementary = escalation.escalate ? cascadePlan.complementary : [];
          analysis.evidence.push(this.evidenceRecord(
            analysis.id,
            "model",
            "model-cascade-policy",
            "detected",
            "informational",
            escalation.escalate
              ? `主模型 ${cascadePlan.primary?.id || "--"} 触发互补模型升级。`
              : `主模型 ${cascadePlan.primary?.id || "--"} 未触发互补模型升级。`,
            {
              policyVersion: this.modelCascadePolicy.policyVersion,
              primaryDetectorId: cascadePlan.primary?.id || null,
              scheduledComplementary: scheduledComplementary.map((detector) => detector.id).join(","),
              escalated: escalation.escalate,
              escalationReasons: escalation.reasons.join(","),
              fusionPolicy: this.modelCascadePolicy.fusionPolicy,
            },
          ));
          this.observability.record({
            timestamp: now(),
            type: "model.cascade",
            analysisId: analysis.id,
            scope: analysis.scope,
            details: {
              policyVersion: this.modelCascadePolicy.policyVersion,
              primary: cascadePlan.primary?.id || null,
              complementary: scheduledComplementary.map((detector) => detector.id).join(","),
              escalated: escalation.escalate,
              reasons: escalation.reasons.join(","),
            },
          });
          if (scheduledComplementary.length > 0) {
            detectorOutcomes.push(...await Promise.all(scheduledComplementary.map((detector) => this.runModelDetector(analysis, detector))));
          }
          for (const detector of enabledModelDetectors) {
            if (detectorOutcomes.some((outcome) => outcome.detector.id === detector.id)) continue;
            analysis.evidence.push(this.evidenceRecord(
              analysis.id,
              "model",
              detector.id,
              "unavailable",
              "none",
              `${detector.id} 未进入本次级联调度；主模型结果未触发互补升级。`,
              { policyEnabled: true, detectionAttempted: false, reason: "cascade_not_escalated", cascadePolicyVersion: this.modelCascadePolicy.policyVersion },
            ));
          }
          for (const outcome of detectorOutcomes) {
            const { detector } = outcome;
            if (outcome.ok) {
              const modelResult = outcome.modelResult;
              analysis.evidence.push(modelDetectionToEvidence(analysis.id, modelResult, now()));
              if (["detected", "not_detected"].includes(modelResult.outcome)) {
                modelResults.push(modelResult);
                completed.push(`${detector.id}=${modelResult.score?.toFixed(4)}`);
              } else {
                unavailable.push(`${detector.id}:${String(modelResult.diagnostics.reason || modelResult.outcome)}`);
              }
            } else {
              const error = outcome.error;
              const reason = error instanceof Error ? error.message : `${detector.id}:UNAVAILABLE`;
              unavailable.push(`${detector.id}:${reason}`);
              analysis.evidence.push(modelDetectorFailureToEvidence(analysis.id, detector.id, error, now()));
            }
          }
          if (modelResults.length >= 2) {
            const directions = new Set(modelResults.map((result) => result.predictedClass));
            const agreement = directions.size === 1 ? "agreement" : "disagreement";
            analysis.evidence.push(this.evidenceRecord(
              analysis.id,
              "model",
              "model-route-comparison",
              "detected",
              "informational",
              agreement === "agreement"
                ? "已执行的模型方向一致，但未校准分数不可直接平均，也不能据此提高裁决置信度。"
                : "已执行的模型方向不一致；各模型结果已独立保留，不通过投票选择结论。",
              {
                detectionAttempted: true,
                comparison: agreement,
                detectorIds: modelResults.map((result) => result.detectorId).join(","),
              directions: modelResults.map((result) => `${result.detectorId}:${result.predictedClass}`).join(","),
                scoreFusion: this.modelCascadePolicy.fusionPolicy,
                fusionPolicy: this.modelCascadePolicy.fusionPolicy,
              },
            ));
          }
          const stageState = completed.length > 0 ? "completed" : "unavailable";
          this.transition(
            analysis,
            "model_detection",
            stageState,
            completed.length > 0
              ? `模型推理完成：${completed.join("，")}。分数独立保留，不进行投票或平均；${unavailable.length > 0 ? `未形成分数：${unavailable.join("，")}` : "全部已返回"}。`
              : `模型均未形成分数：${unavailable.join("，")}`,
          );
        } else {
          this.transition(analysis, "model_detection", "policy_disabled", "模型检测未配置，本次不调用模型服务。");
          analysis.evidence.push(this.evidenceRecord(analysis.id, "model", "model_policy", "policy_disabled", "none", "模型检测由当前策略明确禁用，不属于检测失败。", { policyEnabled: false }));
        }

        this.transition(analysis, "multimodal_observation", "running", "正在执行盲化视觉观察与受预算约束的细节复核。");
        const inspection = await this.forensicInspector.inspect(analysis.id, this.executionAssets.get(id)!, { enableLocalization: localizationEnabled });
        analysis.evidence.push(...inspection.evidence);
        const { evidence: _inspectionEvidence, ...inspectionRecord } = inspection;
        analysis.forensicInspection = inspectionRecord;
        this.transition(
          analysis,
          "multimodal_observation",
          inspection.status === "completed" ? "completed" : inspection.status === "skipped" ? "skipped" : inspection.status === "unavailable" ? "unavailable" : "failed",
          inspection.status === "completed"
            ? `多模态视觉调查已完成，共执行 ${inspection.callsUsed} 次受控调用；结果仅作为支持性证据。`
            : `多模态视觉调查未形成证据：${inspection.reason}`,
        );
        const localizationReason = inspection.localization.status === "completed"
          ? `已生成 ${inspection.localization.artifacts.length} 个通过一致性门控的支持性定位区域。`
          : inspection.localization.reason === "LOCALIZATION_NOT_REQUESTED"
            ? "用户未请求条件定位。"
            : inspection.localization.reason === "NO_SUPPORTED_LOCALIZABLE_CLAIM"
              ? "没有同时满足声明复核、视图一致性和区域要求的线索。"
              : `条件定位未形成产物：${inspection.localization.reason}`;
        this.transition(analysis, "localization", inspection.localization.status, localizationReason);

        this.transition(analysis, "ai_assessment", "running", "正在由多模态 AI 直接判断图像是否为 AI 生成。");
        analysis.aiAssessment = await this.aiAuthenticityAssessor.assess(
          this.executionAssets.get(id)!,
          inspection.observations,
          analysis.evidence,
        );
        const directCompleted = Boolean(analysis.aiAssessment.direct);
        this.transition(
          analysis,
          "ai_assessment",
          directCompleted ? "completed" : analysis.aiAssessment.status === "unavailable" ? "unavailable" : "failed",
          directCompleted
            ? "AI 已完成对原图的直接真实性判断。"
            : `AI 直接判断未完成：${analysis.aiAssessment.reason}`,
        );
        this.transition(
          analysis,
          "ai_counter_analysis",
          analysis.aiAssessment.criticStatus === "completed" ? "completed" : directCompleted ? "failed" : "skipped",
          analysis.aiAssessment.critic
            ? analysis.aiAssessment.critic.disposition === "SUSTAIN"
              ? "独立质疑未发现需要抑制的主要理由；质疑结果不拥有最终结论权限。"
              : "独立质疑提出了理由级问题，已交给最终裁决器权衡，不会自动降为不确定。"
            : directCompleted
              ? `独立质疑未完成：${analysis.aiAssessment.criticReason || analysis.aiAssessment.reason}`
              : "主判断不可用，未执行独立质疑。",
        );
        this.transition(
          analysis,
          "ai_final_adjudication",
          analysis.aiAssessment.final ? "completed" : directCompleted ? "failed" : "skipped",
          analysis.aiAssessment.final
            ? `AI 已综合原图、专用模型、来源证据与理由质疑，形成${analysis.aiAssessment.final.confidenceBand === "high" ? "高" : analysis.aiAssessment.final.confidenceBand === "medium" ? "中" : "低"}置信度最终判断。`
            : directCompleted
              ? `最终综合裁决未完成：${analysis.aiAssessment.reason}`
              : "主判断不可用，未执行最终综合裁决。",
        );
      }

      analysis.decision = decideProvenanceFirst(analysis.evidence, now(), modelEnabled);
      const candidateProductDecision = comprehensiveDecision(analysis.decision, analysis.aiAssessment, now());
      analysis.productDecision = applyProductionDecisionGate(
        candidateProductDecision,
        analysis.decision,
        this.productionDecisionGate,
        candidateProductDecision.decidedAt,
      );
      const gateEvidence = this.evidenceRecord(
        analysis.id,
        "integrity",
        "production-decision-gate",
        "detected",
        "informational",
        this.productionDecisionGate.authorized
          ? "当前运行时已获得生产标签门禁授权。"
          : "生产标签门禁尚未授权；AI 概率意见保留在审计记录，产品结论按证据不足发布。",
        {
          productionLabelingAuthorized: this.productionDecisionGate.authorized,
          gateReason: this.productionDecisionGate.reason,
          candidateVerdict: candidateProductDecision.verdict,
          authenticatedProvenance: analysis.decision.basis.some((basis) => basis.startsWith("VERIFIED_PROVENANCE:")),
        },
      );
      analysis.evidence.push(gateEvidence);
      analysis.productDecision = {
        ...analysis.productDecision,
        evidenceRefs: [...new Set([...analysis.productDecision.evidenceRefs, gateEvidence.id])],
      };
      this.observability.record({
        timestamp: now(),
        type: "decision.sealed",
        analysisId: id,
        scope: analysis.scope,
        details: {
          productVerdict: analysis.productDecision.verdict,
          provenanceVerdict: analysis.decision.verdict,
          basisCount: analysis.productDecision.basis.length,
          evidenceCount: analysis.evidence.length,
        },
      });
      this.transition(
        analysis,
        "decision",
        "completed",
        analysis.productDecision === analysis.decision
          ? "已形成来源凭证结论；综合 AI 裁决不可用或已由强来源证据短路。"
          : "已封存 AI 综合产品结论，并将来源凭证结论单独保留。",
      );

      let limitations = deriveLimitations(analysis.productDecision, analysis.evidence);
      const supportedVisualEvidenceRefs = new Set(
        [
          ...(analysis.forensicInspection?.visualValidations
            .filter((validation) => validation.status === "supported")
            .map((validation) => validation.sourceEvidenceRef) || []),
          ...(analysis.forensicInspection?.visibleMarks
            .filter((mark) => mark.status === "supported")
            .map((mark) => mark.evidenceRef) || []),
        ],
      );
      analysis.claims = createAtomicClaims(analysis.productDecision, analysis.evidence, limitations, supportedVisualEvidenceRefs);
      this.transition(analysis, "explanation", "running", "正在根据结构化证据生成 AI 综合分析。");
      let correctionFeedback: string[] | undefined;
      let synthesisAttempts = 0;
      let synthesisResult: Awaited<ReturnType<ReportSynthesizer["synthesize"]>> | undefined;
      let finalChecks: NonNullable<AnalysisRun["validation"]>["checks"] = [];
      let verifierIdentity: NonNullable<AnalysisRun["validation"]>["validator"];
      let explanationVerified = false;
      try {
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          synthesisAttempts = attempt;
          synthesisResult = await this.reportSynthesizer.synthesize({
            decision: analysis.productDecision,
            provenanceConclusion: analysis.decision,
            aiAssessment: analysis.aiAssessment,
            evidence: analysis.evidence,
            claims: analysis.claims,
            limitations,
            correctionFeedback,
          });
          if (attempt === 1) {
            this.transition(analysis, "explanation", "completed", "AI 综合分析初稿已生成，等待独立复核。");
            this.transition(analysis, "verification", "running", "正在执行精确校验和独立的正向、反向、改写与强制选择复核。");
          }

          const exactChecks = validateSynthesizedText(
            synthesisResult.text,
            analysis.claims,
            analysis.productDecision,
            analysis.evidence,
            supportedVisualEvidenceRefs,
          );
          const semantic = await this.explanationVerifier.verify({
            analysisId: analysis.id,
            decision: analysis.productDecision,
            claims: analysis.claims,
            explanation: synthesisResult.text,
          });
          verifierIdentity = { provider: semantic.provider, model: semantic.model };
          finalChecks = [...exactChecks, ...semantic.checks];
          if (finalChecks.every((check) => check.passed)) {
            explanationVerified = true;
            break;
          }
          correctionFeedback = finalChecks
            .filter((check) => !check.passed)
            .map((check) => `${check.id}: ${check.detail}`);
        }
      } catch (error) {
        this.transition(
          analysis,
          "explanation",
          "failed",
          error instanceof Error ? error.message : "AI_SYNTHESIS_FAILED",
        );
        throw error;
      }

      if (!synthesisResult) throw new Error("AI_SYNTHESIS_EMPTY");
      analysis.explanation = explanationVerified
        ? synthesisResult.text
        : deterministicFallbackExplanation(analysis.productDecision, analysis.evidence);
      analysis.synthesis = {
        provider: synthesisResult.provider,
        model: synthesisResult.model,
        promptBundle: {
          id: ACTIVE_EXPLANATION_PROMPT_BUNDLE.id,
          version: ACTIVE_EXPLANATION_PROMPT_BUNDLE.version,
          evaluationStatus: ACTIVE_EXPLANATION_PROMPT_BUNDLE.evaluationStatus,
          promptHashes: { ...ACTIVE_EXPLANATION_PROMPT_BUNDLE.promptHashes },
        },
        generatedAt: synthesisResult.generatedAt,
        attempts: synthesisAttempts,
        outputType: explanationVerified ? "ai_synthesis" : "deterministic_fallback",
      };
      if (!explanationVerified) {
        limitations = [...limitations, "AI 综合分析在一次重写后仍未通过复核，已发布确定性回退说明。"];
      }
      analysis.validation = {
        schemaVersion: ANALYSIS_SCHEMA_VERSION,
        status: explanationVerified ? "verified" : "fallback",
        checks: finalChecks,
        attempts: synthesisAttempts,
        ...(verifierIdentity ? { validator: verifierIdentity } : {}),
        ...(!explanationVerified ? { fallbackReason: "EXPLANATION_VERIFICATION_FAILED" } : {}),
        validatedAt: now(),
      };
      this.observability.record({
        timestamp: analysis.validation.validatedAt,
        type: explanationVerified ? "explanation.completed" : "explanation.fallback",
        analysisId: id,
        scope: analysis.scope,
        details: { attempts: synthesisAttempts, outputType: analysis.synthesis.outputType, checks: finalChecks.length },
      });
      this.transition(
        analysis,
        "verification",
        "completed",
        explanationVerified
          ? "AI 综合分析已通过精确校验与极性复核。"
          : "AI 综合分析未通过复核，已切换为确定性回退说明。",
      );
      const explanationStage = analysis.stages.find((stage) => stage.id === "explanation");
      if (explanationStage) {
        explanationStage.reason = explanationVerified
          ? "AI 综合分析已生成并通过独立复核。"
          : "AI 综合分析未通过复核，已发布确定性回退说明。";
      }
      const { storedPath: _storedPath, ...publicAsset } = analysis.asset;
      analysis.report = {
        schemaVersion: ANALYSIS_SCHEMA_VERSION,
        analysisId: analysis.id,
        directEvidencePolicyVersion: analysis.directEvidencePolicyVersion,
        asset: publicAsset,
        productDecision: analysis.productDecision,
        provenanceConclusion: analysis.decision,
        decision: analysis.decision,
        claims: analysis.claims,
        explanation: analysis.explanation,
        synthesis: analysis.synthesis,
        validation: analysis.validation,
        evidence: analysis.evidence,
        stages: analysis.stages,
        ...(analysis.forensicInspection ? { forensicInspection: analysis.forensicInspection } : {}),
        ...(analysis.aiAssessment ? { aiAssessment: analysis.aiAssessment } : {}),
        limitations,
        sealed: true,
        createdAt: now(),
      };
      analysis.state = "completed";
      analysis.stateVersion += 1;
      analysis.updatedAt = now();
      this.progress(analysis, "analysis", "completed");
      this.store.save(analysis);
      this.observability.record({ timestamp: analysis.updatedAt, type: "analysis.completed", analysisId: id, scope: analysis.scope, details: { evidenceCount: analysis.evidence.length } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ANALYSIS_EXECUTION_FAILED";
      const current = this.store.get(id);
      if (current?.state === "cancelled" || current?.report?.sealed
        || /^(ANALYSIS_CANCELLED|ANALYSIS_LEASE_LOST|STATE_VERSION_CONFLICT|ANALYSIS_TERMINAL_SEALED)/.test(message)
        || (current && current.stateVersion > analysis.stateVersion)) {
        return;
      }
      analysis.state = "failed";
      const explanationFailed = analysis.stages.find((stage) => stage.id === "explanation")?.state === "failed";
      analysis.error = {
        code: explanationFailed ? "AI_SYNTHESIS_FAILED" : "ANALYSIS_EXECUTION_FAILED",
        message,
        retryable: (analysis.attempt || 1) < MAX_ANALYSIS_ATTEMPTS
          && !/^(INVALID_|UNKNOWN_STAGE|BLIND_PROFILE_MISSING)/.test(error instanceof Error ? error.message : ""),
      };
      analysis.stateVersion += 1;
      analysis.updatedAt = now();
      this.progress(analysis, "analysis", "failed", undefined, analysis.error.message);
      this.store.save(analysis);
      this.observability.record({ timestamp: analysis.updatedAt, type: "analysis.failed", analysisId: id, scope: analysis.scope, code: analysis.error.code });
    } finally {
      this.executionAssets.delete(id);
      materialized?.cleanup();
    }
  }

  private transition(analysis: AnalysisRun, id: AnalysisStage["id"], state: AnalysisStage["state"], reason?: string): void {
    this.assertWritable(analysis, analysis.leaseId);
    const stage = analysis.stages.find((item) => item.id === id);
    if (!stage) throw new Error(`UNKNOWN_STAGE:${id}`);
    const timestamp = now();
    if (stage.state === "pending" && state !== "running") {
      stage.state = "running";
      stage.startedAt = timestamp;
      analysis.stateVersion += 1;
      analysis.updatedAt = timestamp;
      this.progress(analysis, "stage", "running", id);
      this.store.save(analysis);
    }
    stage.startedAt ??= timestamp;
    stage.state = state;
    stage.reason = reason;
    if (!["pending", "running"].includes(state)) stage.completedAt = timestamp;
    analysis.stateVersion += 1;
    analysis.updatedAt = timestamp;
    this.progress(analysis, "stage", state, id, reason);
    this.store.save(analysis);
    this.observability.record({ timestamp, type: "stage.transition", analysisId: analysis.id, stageId: id, state, scope: analysis.scope });
  }

  private progress(analysis: AnalysisRun, scope: "analysis" | "stage", state: AnalysisRun["state"] | AnalysisStage["state"], stageId?: AnalysisStage["id"], reason?: string): void {
    analysis.progressEvents.push({
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      analysisId: analysis.id,
      sequence: analysis.progressEvents.length + 1,
      scope,
      state,
      stageId,
      reason,
      createdAt: now(),
    });
  }

  private evidenceRecord(analysisId: string, category: EvidenceRecord["category"], source: string, status: EvidenceRecord["status"], strength: EvidenceRecord["strength"], summary: string, facts: EvidenceRecord["facts"]): EvidenceRecord {
    return { schemaVersion: ANALYSIS_SCHEMA_VERSION, id: randomUUID(), analysisId, category, source, status, strength, summary, facts, createdAt: now() };
  }

  private validateSubmission(input: AnalysisSubmission): { filename: string; mimeType: string; bytes: Buffer; idempotencyKey: string; scope: string } {
    const filename = typeof input.filename === "string" ? input.filename.trim() : "";
    const mimeType = typeof input.mimeType === "string" ? input.mimeType.trim().toLowerCase() : "";
    if (!filename || filename.length > 255 || /[\u0000-\u001f]/.test(filename) || /[\\/]/.test(filename)) throw new Error("INVALID_FILENAME");
    if (!mimeType.startsWith("image/")) throw new Error("INVALID_IMAGE_TYPE");
    if (typeof input.dataBase64 !== "string" || !input.dataBase64
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.dataBase64)
      || input.dataBase64.length % 4 === 1) throw new Error("INVALID_IMAGE_DATA");
    const bytes = Buffer.from(input.dataBase64, "base64");
    if (!bytes.length) throw new Error("INVALID_IMAGE_DATA");
    if (bytes.length > this.maxImageBytes) throw new Error("IMAGE_TOO_LARGE");
    const scope = typeof input.scope === "string" && /^[a-zA-Z0-9._:-]{1,80}$/.test(input.scope.trim())
      ? input.scope.trim()
      : "anonymous";
    const rawIdempotencyKey = input.idempotencyKey?.trim() || createHash("sha256")
      .update(bytes)
      .update(JSON.stringify(input.options || {}))
      .update(ANALYSIS_SCHEMA_VERSION)
      .update(ANALYSIS_POLICY_VERSION)
      .digest("hex");
    const idempotencyKey = scope === "anonymous" ? rawIdempotencyKey : `${scope}:${rawIdempotencyKey}`;
    if (idempotencyKey.length > 200) throw new Error("INVALID_IDEMPOTENCY_KEY");
    return { filename, mimeType, bytes, idempotencyKey, scope };
  }

  private expireQueued(id: string): void {
    try {
      const analysis = this.get(id);
      if (analysis.state !== "queued") return;
      analysis.state = "failed";
      analysis.stateVersion += 1;
      analysis.error = {
        code: "ANALYSIS_QUEUE_EXPIRED",
        message: "Analysis exceeded the maximum queue age before execution.",
        retryable: true,
      };
      analysis.updatedAt = now();
      this.progress(analysis, "analysis", "failed", undefined, analysis.error.message);
      this.store.save(analysis);
    } catch {
      // Expiry is best-effort; a newer worker or terminal writer owns the record.
    }
  }

  private assertWritable(analysis: AnalysisRun, leaseId?: string): void {
    const current = this.store.get(analysis.id);
    if (!current) throw new Error("ANALYSIS_NOT_FOUND");
    if (current.report?.sealed) throw new Error("ANALYSIS_TERMINAL_SEALED");
    if (current.state === "cancelled" || current.cancelRequested) throw new Error("ANALYSIS_CANCELLED");
    if (current.stateVersion > analysis.stateVersion) throw new Error("STATE_VERSION_CONFLICT");
    if (leaseId && !this.scheduler.isLeaseCurrent(analysis.id, leaseId)) throw new Error("ANALYSIS_LEASE_LOST");
  }
}
