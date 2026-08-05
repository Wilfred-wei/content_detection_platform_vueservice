export type AgentState = 'ready' | 'not_configured' | 'busy' | 'failed'

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface AgentSession {
  id: string
  status: 'idle' | 'busy' | 'failed'
  createdAt: string
  updatedAt: string
  messages: AgentMessage[]
  error?: string
}

export interface AgentHealth {
  service: string
  status: 'healthy'
  state: AgentState
  pi: {
    provider: string
    model: string
    providerReady: boolean
  }
  configuration?: { runtimeEnabled: boolean }
}

export interface AgentRuntimeConfig {
  provider: string
  model: string
  authority: 'probabilistic_ai_opinion'
  baseUrl?: string
  allowAnonymous: boolean
  providerReady: boolean
  apiKeyConfigured: boolean
  runtimeConfigEnabled: boolean
  persistence: 'filesystem'
  authRequired?: boolean
  queue?: {
    maxConcurrency: number
    maxQueue: number
    leaseMs: number
    maxAgeMs: number
  }
  sessionsReset?: boolean
}

export interface AgentRuntimeConfigInput {
  provider: string
  model: string
  baseUrl?: string
  apiKey?: string
  allowAnonymous: boolean
  clearApiKey?: boolean
}

export interface ModelRuntimeInfo {
  detectorId: string
  enabled: boolean
  device: string
  residency: 'process_scoped' | 'not_loaded' | 'unknown'
  admission: 'single_slot_bounded_queue' | 'bounded_microbatch_queue' | 'not_configured' | 'unknown'
  maxQueue: number | null
  microbatchSize: number
  resourceClass: 'cpu' | 'gpu' | 'unknown'
  memoryReservationMb?: number | null
  slotCount?: number
  maxBatchDelayMs?: number
}

export interface AgentConnectionTest {
  ok: true
  latencyMs: number
  configuration: AgentRuntimeConfig
}

export interface ReleaseReadiness {
  schemaVersion: 'release-readiness.v1'
  generatedAt: string
  status: 'ready' | 'blocked'
  productionSwapAuthorized: false
  automaticPolicyMutation: false
  checks: Array<{
    id: string
    status: 'passed' | 'blocked' | 'not_applicable'
    reasons: string[]
  }>
}

export interface AgentCapabilities {
  conversation: { status: AgentState }
  capabilities: Array<{
    id: 'ai_image_detection' | 'news_verification' | 'video_forensics'
    status: 'not_configured' | 'framework_ready'
    detectorCoverage?: 'unavailable' | 'direct_evidence_only' | 'partial' | 'ready'
    modelPolicy?: 'disabled' | 'enabled'
    provenanceRegistry?: {
      version: string
      researchedAt: string
      eligibility: Record<string, number>
    }
  }>
}

export interface ProvenanceScheme {
  id: string
  name: string
  family: string
  compatibility: string[]
  primarySources: string[]
  license: string
  accessClass: string
  requiredKeysOrModels: string[]
  supportedProducts: string[]
  runtimeEligibility: 'planned_local' | 'evaluation_only' | 'unavailable' | 'disabled_policy'
  calibration: { status: 'required' | 'approved' | 'not_applicable'; artifact: string | null }
  sampleSource: string
  owner: string
  lastVerifiedAt: string
  shortCircuit: { policy: 'prohibited' | 'candidate_after_gate' | 'eligible'; reason: string }
}

export interface ProvenanceRegistry {
  schemaVersion: string
  registryVersion: string
  researchedAt: string
  policy: {
    commercialApisAllowed: boolean
    manualVerifierResultsAreProductionEvidence: boolean
    absenceIsNeutral: boolean
    shortCircuitRequiresApprovedCalibration: boolean
  }
  schemes: ProvenanceScheme[]
}

export type AnalysisState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type StageState = 'pending' | 'running' | 'completed' | 'skipped' | 'policy_disabled' | 'unavailable' | 'failed'

export interface AnalysisStage {
  id: string
  label: string
  state: StageState
  reason?: string
}

export interface AiAssessmentReason {
  id: string
  direction: 'supports_ai' | 'supports_non_ai' | 'uncertain'
  claim: string
  strength: 'strong' | 'moderate' | 'weak'
  observationRefs: string[]
  evidenceRefs: string[]
}

export interface AiAuthenticityAssessment {
  status: 'completed' | 'unavailable' | 'failed'
  reason: string
  provider: string
  model: string
  promptBundle: {
    id: string
    version: string
    evaluationStatus: 'prototype_not_calibrated'
    promptHashes: Record<string, string>
  }
  direct?: {
    verdict: 'AI_GENERATED' | 'LIKELY_NON_AI' | 'INCONCLUSIVE'
    confidence: number
    summary: string
    reasons: AiAssessmentReason[]
    counterEvidence: string[]
    limitations: string[]
    imageInstructionDetected: boolean
  }
  critic?: {
    disposition: 'SUSTAIN' | 'CHALLENGE' | 'ABSTAIN'
    verdict?: 'AI_GENERATED' | 'LIKELY_NON_AI' | 'INCONCLUSIVE'
    confidenceCap?: number
    summary: string
    challengedReasonIds: string[]
    unsupportedReasonIds: string[]
    counterEvidence: string[]
    counterEvidenceRefs?: string[]
    imageInstructionDetected: boolean
  }
  criticStatus?: 'completed' | 'failed' | 'skipped'
  criticReason?: string
  final?: {
    verdict: 'AI_GENERATED' | 'LIKELY_NON_AI' | 'INCONCLUSIVE'
    confidence: number
    confidenceBand: 'high' | 'medium' | 'low'
    summary: string
    retainedReasonIds: string[]
    rejectedReasonIds: string[]
    evidenceRefs: string[]
    counterEvidence: string[]
    limitations: string[]
    conflicts: string[]
    imageInstructionDetected: boolean
  }
  reconciled: {
    authority: 'probabilistic_ai_opinion'
    authenticatedProvenance: false
    verdict: 'AI_GENERATED' | 'LIKELY_NON_AI' | 'INCONCLUSIVE'
    confidence: number
    confidenceBand: 'high' | 'medium' | 'low' | 'unavailable'
    status: 'adjudicated' | 'agreed' | 'revised_to_inconclusive' | 'unavailable'
    summary: string
    reasons: AiAssessmentReason[]
    evidenceRefs?: string[]
    counterEvidence: string[]
    limitations: string[]
    conflicts: string[]
  }
  assessedAt: string
}

export interface EvidenceRecord {
  id: string
  category: 'integrity' | 'provenance' | 'watermark' | 'metadata' | 'visual' | 'model' | 'localization'
  source: string
  status: 'verified_present' | 'possibly_present' | 'detected' | 'not_detected' | 'policy_disabled' | 'detector_unavailable' | 'unsupported_format' | 'unavailable' | 'unsupported' | 'invalid' | 'error'
  strength: 'strong' | 'supporting' | 'informational' | 'none'
  summary: string
  facts: Record<string, string | number | boolean | null>
}

export interface VisualClaimCheck {
  id: string
  variant: 'positive' | 'semantic_inverse' | 'paraphrase' | 'forced_choice'
  view: 'original' | 'crop'
  outcome: 'supported' | 'contradicted' | 'unverifiable'
  rawOutcome?: 'supported' | 'contradicted' | 'unverifiable' | 'unknown' | 'error'
  description: string
  region?: readonly [number, number, number, number] | null
  viewSha256: string
  promptId?: string
  promptHash?: string
  provider: string
  model: string
  latencyMs?: number
}

export interface VisualClaimValidation {
  id: string
  observationId: string
  sourceEvidenceRef: string
  cueId: string
  claim: string
  status: 'supported' | 'contradicted' | 'unverifiable'
  polarityConsistency: 'consistent' | 'conflict' | 'unverifiable'
  viewConsistency: 'consistent' | 'conflict' | 'unverifiable' | 'not_checked'
  checks: VisualClaimCheck[]
  policyVersion: string
  validatedAt: string
}

export interface LocalizationArtifact {
  id: string
  analysisId: string
  observationId: string
  sourceEvidenceRef: string
  validationId: string
  cueId: string
  description: string
  region: readonly [number, number, number, number]
  sourceRegion: readonly [number, number, number, number]
  overlapRatio: number
  coordinateSpace: 'normalized_original'
  viewSha256: string
  profileId: 'conditional-region-proposal-v1'
  promptId: string
  promptHash: string
  provider: string
  model: string
  authority: 'supporting_only'
  createdAt: string
}

export interface ConditionalLocalizationResult {
  requested: boolean
  status: 'completed' | 'skipped' | 'unavailable' | 'failed'
  reason: string
  artifacts: LocalizationArtifact[]
}

export interface VisibleMarkRecord {
  id: string
  evidenceRef: string
  state: 'present' | 'absent' | 'unknown'
  status: 'supported' | 'absent' | 'unverifiable' | 'failed'
  markType: 'text_label' | 'provider_logo' | 'disclosure_badge' | 'other_ai_claim' | 'none' | 'unknown'
  visibleText: string | null
  claimedProvider: string | null
  description: string
  region: readonly [number, number, number, number] | null
  viewSha256: string
  verificationOutcome: 'supported' | 'contradicted' | 'unverifiable' | 'not_run'
  verificationDescription: string | null
  verificationRegion: readonly [number, number, number, number] | null
  regionOverlapRatio: number | null
  provider: string
  model: string
  authority: 'supporting_only'
  forgeryRisk: {
    copyable: true
    removable: true
    forgeable: true
    providerIdentityVerified: false
    provenanceVerified: false
  }
  createdAt: string
}

export interface ForensicInspectionRecord {
  promptBundle?: {
    id: string
    version: string
    cueTaxonomyVersion: string
    evaluationStatus: 'prototype_not_calibrated'
  }
  status: 'completed' | 'skipped' | 'unavailable' | 'failed'
  reason: string
  callsUsed: number
  pixelsUsed: number
  estimatedOutputTokensUsed: number
  roundsUsed: number
  visualValidations: VisualClaimValidation[]
  visibleMarks?: VisibleMarkRecord[]
  localization?: ConditionalLocalizationResult
}

export interface AnalysisRun {
  id: string
  directEvidencePolicyVersion: string
  state: AnalysisState
  stateVersion: number
  assetDeletedAt?: string
  tombstone?: { deletedAt: string; reason: 'authorized_deletion' | 'retention_expiry' }
  attempt: number
  retryHistory: Array<{
    attempt: number
    failedAt: string
    error: { code: string; message: string; retryable: boolean }
  }>
  options: { enableLocalization: boolean }
  reused?: boolean
  asset: {
    id: string
    filename: string
    mimeType: string
    sizeBytes: number
    sha256: string
    width?: number
    height?: number
  }
  stages: AnalysisStage[]
  executionPlan: Array<{ stageId: string; dependsOn: string[]; condition: string }>
  progressEvents: Array<{ sequence: number; scope: 'analysis' | 'stage'; state: AnalysisState | StageState; stageId?: string; reason?: string; createdAt: string }>
  evidence: EvidenceRecord[]
  forensicInspection?: ForensicInspectionRecord
  aiAssessment?: AiAuthenticityAssessment
  productDecision?: AnalysisReport['decision']
  decision?: AnalysisReport['decision']
  error?: { code: string; message: string; retryable: boolean }
}

export interface AnalysisReport {
  analysisId: string
  directEvidencePolicyVersion: string
  productDecision?: AnalysisReport['decision']
  provenanceConclusion?: AnalysisReport['decision']
  decision: {
    verdict: 'AI_GENERATED' | 'LIKELY_NON_AI' | 'INCONCLUSIVE'
    confidenceBand: 'high' | 'medium' | 'low' | 'unavailable'
    basis: string[]
    evidenceRefs: string[]
    conflicts: string[]
    modelCoverage: 'policy_disabled' | 'enabled'
    policyVersion: string
  }
  claims: Array<{
    id: string
    type: 'verdict' | 'provenance' | 'metadata' | 'visual' | 'coverage' | 'conflict' | 'limitation'
    materiality: 'material' | 'supporting'
    statement: string
    evidenceRefs: string[]
    authoritativeValue?: string
  }>
  explanation: string
  synthesis: {
    provider: string
    model: string
    promptBundle?: {
      id: string
      version: string
      evaluationStatus: 'prototype_not_calibrated'
      promptHashes: Record<string, string>
    }
    generatedAt: string
    attempts: number
    outputType: 'ai_synthesis' | 'deterministic_fallback'
  }
  validation: {
    status: 'verified' | 'fallback' | 'failed' | 'not_run'
    checks: Array<{
      id: string
      passed: boolean
      outcome: 'supported' | 'contradicted' | 'unverifiable' | 'not_applicable'
      method: 'exact' | 'semantic_positive' | 'semantic_inverse' | 'semantic_paraphrase' | 'semantic_forced_choice'
      detail: string
      question?: string
      answer?: string
    }>
    attempts: number
    validator?: { provider: string; model: string }
    fallbackReason?: string
  }
  evidence: EvidenceRecord[]
  aiAssessment?: AiAuthenticityAssessment
  stages: AnalysisStage[]
  forensicInspection?: ForensicInspectionRecord
  limitations: string[]
  sealed: true
}

export interface AnalysisSubmission {
  filename: string
  mimeType: string
  dataBase64: string
  idempotencyKey?: string
  options?: { enableLocalization?: boolean }
}

export interface AnalysisProgress {
  analysisId: string
  cursor: number
  nextCursor: number
  terminal: boolean
  events: AnalysisRun['progressEvents']
}

interface DataResponse<T> {
  success: true
  data: T
}

interface ErrorResponse {
  error?: {
    code?: string
    message?: string
  }
}

const BASE_URL = '/api/v1/agent'

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (!text.trim()) {
    throw new Error(`Agent服务无响应 (${response.status})`)
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Agent服务返回了无效响应 (${response.status})`)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: init?.body
      ? { 'content-type': 'application/json', ...init.headers }
      : init?.headers,
  })
  const body = await readJsonResponse<DataResponse<T> | ErrorResponse>(response)
  if (!response.ok || !('data' in body)) {
    throw new Error(('error' in body && body.error?.message) || `Agent请求失败 (${response.status})`)
  }
  return body.data
}

export const agentApi = {
  health: () => request<AgentHealth>('/health'),
  capabilities: () => request<AgentCapabilities>('/capabilities'),
  provenanceRegistry: () => request<ProvenanceRegistry>('/provenance/registry'),
  modelRuntime: () => request<{ generatedAt: string; models: ModelRuntimeInfo[]; note: string }>('/models/runtime'),
  releaseReadiness: () => request<ReleaseReadiness>('/release/readiness'),
  getConfiguration: () => request<AgentRuntimeConfig>('/config'),
  updateConfiguration: (configuration: AgentRuntimeConfigInput) => request<AgentRuntimeConfig>(
    '/config',
    { method: 'PUT', body: JSON.stringify(configuration) },
  ),
  testConfiguration: (configuration: AgentRuntimeConfigInput) => request<AgentConnectionTest>(
    '/config/test',
    { method: 'POST', body: JSON.stringify(configuration) },
  ),
  createSession: () => request<AgentSession>('/sessions', { method: 'POST', body: '{}' }),
  getSession: (sessionId: string) => request<AgentSession>(`/sessions/${sessionId}`),
  sendMessage: (sessionId: string, content: string) => request<AgentSession>(
    `/sessions/${sessionId}/messages`,
    { method: 'POST', body: JSON.stringify({ content }) },
  ),
  cancel: (sessionId: string) => request<AgentSession>(
    `/sessions/${sessionId}/cancel`,
    { method: 'POST', body: '{}' },
  ),
  createAnalysis: (submission: AnalysisSubmission) => request<AnalysisRun>(
    '/analyses',
    { method: 'POST', body: JSON.stringify(submission) },
  ),
  getAnalysis: (analysisId: string) => request<AnalysisRun>(`/analyses/${analysisId}`),
  analysisAssetUrl: (analysisId: string) => `${BASE_URL}/analyses/${encodeURIComponent(analysisId)}/asset`,
  retryAnalysis: (analysisId: string) => request<AnalysisRun>(
    `/analyses/${analysisId}/retry`,
    { method: 'POST', body: '{}' },
  ),
  cancelAnalysis: (analysisId: string) => request<AnalysisRun>(
    `/analyses/${analysisId}/cancel`,
    { method: 'POST', body: '{}' },
  ),
  getAnalysisProgress: (analysisId: string, cursor = 0) => request<AnalysisProgress>(
    `/analyses/${analysisId}/progress?cursor=${encodeURIComponent(String(cursor))}`,
  ),
  exportAnalysis: (analysisId: string) => request<{
    analysisId: string
    state: AnalysisState
    report: AnalysisReport | null
    evidence: EvidenceRecord[]
    progress: AnalysisRun['progressEvents']
  }>(`/analyses/${analysisId}/export`),
  deleteAnalysisAsset: (analysisId: string) => request<AnalysisRun>(
    `/analyses/${analysisId}/asset`,
    { method: 'DELETE', body: '{}' },
  ),
  getReport: (analysisId: string) => request<AnalysisReport>(`/analyses/${analysisId}/report`),
}
