import { AnalysisService } from "./analysis-service.js";
import { AnalysisStore } from "./analysis-store.js";
import { loadConfig } from "./config.js";
import { PiExplanationVerifier } from "./explanation-verifier.js";
import { createConfiguredForensicInspector } from "./forensic-inspection.js";
import {
  createPiEngineFactory,
  createPiForensicObservationEngineFactory,
  createPiForensicPlannerEngineFactory,
  createPiAiAuthenticityAssessmentEngineFactory,
  createPiAiAuthenticityAdjudicatorEngineFactory,
  createPiAiAuthenticityCriticEngineFactory,
  createPiSynthesisEngineFactory,
  createPiVerificationEngineFactory,
} from "./pi-engine.js";
import { PiReportSynthesizer } from "./report-synthesizer.js";
import { createAgentServer } from "./server.js";
import { SessionStore } from "./session-store.js";
import { PiAiAuthenticityAssessor } from "./ai-authenticity-assessment.js";
import { DdaModelDetector, DdaShadowModelDetector } from "./dda-model-detector.js";
import { MirrorModelDetector } from "./mirror-model-detector.js";
import { SafeModelDetector } from "./safe-model-detector.js";
import { PersistentAnalysisQueue } from "./analysis-queue.js";
import { FileObservability } from "./observability.js";
import { LegacyAiDetectionAdapter } from "./legacy-ai-detection-adapter.js";
import { createStorageProtector } from "./storage-crypto.js";
import { verifyPolicyBundle } from "./policy-bundle.js";
import { ModelResourceScheduler } from "./model-resource-scheduler.js";

const config = loadConfig();
verifyPolicyBundle();
const storageProtector = config.storageEncryptionKey ? createStorageProtector(config.storageEncryptionKey) : undefined;
const reportSynthesizer = new PiReportSynthesizer(config, createPiSynthesisEngineFactory(config));
const explanationVerifier = new PiExplanationVerifier(config, createPiVerificationEngineFactory(config));
const forensicInspector = createConfiguredForensicInspector(
  config,
  createPiForensicObservationEngineFactory(config),
  createPiForensicPlannerEngineFactory(config),
);
const aiAuthenticityAssessor = new PiAiAuthenticityAssessor(
  config,
  createPiAiAuthenticityAssessmentEngineFactory(config),
  createPiAiAuthenticityCriticEngineFactory(config),
  createPiAiAuthenticityAdjudicatorEngineFactory(config),
);
const ddaBaseline = new DdaModelDetector(config.dda);
const ddaDetector = config.ddaShadow.enabled
  ? new DdaShadowModelDetector(ddaBaseline, new DdaModelDetector(config.ddaShadow.candidate), config.ddaShadow)
  : ddaBaseline;
const modelDetectors = [
  ddaDetector,
  new MirrorModelDetector(config.mirror),
  new SafeModelDetector(config.safe),
  new LegacyAiDetectionAdapter(config.legacyAiDetection),
];
const analysisQueue = new PersistentAnalysisQueue(config.analysisDataDir, {
  maxQueue: config.maxAnalysisQueue,
  concurrency: config.maxAnalysisConcurrency,
  leaseMs: config.analysisLeaseMs,
  maxAgeMs: config.maxAnalysisAgeMs,
  scopeWeights: config.analysisScopeWeights,
});
const observability = new FileObservability(config.analysisDataDir, 200, storageProtector);
const analyses = new AnalysisService(
  new AnalysisStore(config.analysisDataDir, storageProtector),
  config.maxImageBytes,
  reportSynthesizer,
  explanationVerifier,
  undefined,
  undefined,
  undefined,
  forensicInspector,
  aiAuthenticityAssessor,
  modelDetectors,
  undefined,
  undefined,
  analysisQueue,
  observability,
  undefined,
  new ModelResourceScheduler(config.modelDeviceCapacities),
  undefined,
  {
    authorized: config.productionLabelingAuthorized,
    reason: config.productionLabelingAuthorized
      ? "operator_promoted_after_release_evidence"
      : "production_release_evidence_not_promoted",
  },
);
const sessions = new SessionStore(createPiEngineFactory(config, analyses), config.maxSessions, config.maxMessagesPerSession, `${config.analysisDataDir}/sessions`, storageProtector);
const server = createAgentServer(config, sessions, analyses, { observability });
const retentionTimer = setInterval(() => {
  analyses.pruneExpired(config.retentionMs);
}, Math.min(config.retentionMs, 60 * 60 * 1000));
retentionTimer.unref?.();

server.listen(config.port, config.host, () => {
  console.log(`[detection-agent] listening on http://${config.host}:${config.port}`);
  console.log(`[detection-agent] Pi provider state: ${config.providerReady ? "ready" : "not_configured"}`);
});

function shutdown(): void {
  clearInterval(retentionTimer);
  modelDetectors.forEach((detector) => detector.close());
  analysisQueue.close();
  sessions.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
