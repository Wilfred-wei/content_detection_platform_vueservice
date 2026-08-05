export interface ModelDriftBaseline {
  detectorId: string;
  samples: number;
  meanScore: number;
  scoreStdDev: number;
  detectedRate: number;
  oodRate: number;
}

export interface ModelDriftPolicy {
  schemaVersion: "model-drift-policy.v1";
  policyVersion: string;
  windowSize: number;
  minimumWindowSamples: number;
  maxMeanZScore: number;
  maxDetectedRateDelta: number;
  maxOodRate: number;
  baselines: readonly ModelDriftBaseline[];
}

export interface ModelDriftObservation {
  detectorId: string;
  score: number | null;
  outcome: "detected" | "not_detected" | "unavailable" | "unsupported_format" | "error";
  outOfDistribution: boolean | null;
  timestamp: string;
}

export interface ModelDriftAssessment {
  detectorId: string;
  samples: number;
  status: "clear" | "alert" | "insufficient_data" | "no_baseline";
  current: { meanScore: number | null; detectedRate: number | null; oodRate: number | null };
  baseline: ModelDriftBaseline | null;
  alerts: string[];
  shadowEvaluationRequired: boolean;
  automaticPolicyMutation: false;
}

export interface ModelDriftSnapshot {
  schemaVersion: "model-drift-snapshot.v1";
  policyVersion: string;
  generatedAt: string;
  assessments: ModelDriftAssessment[];
}

function boundedRatio(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error(`INVALID_MODEL_DRIFT:${field}`);
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error(`INVALID_MODEL_DRIFT:${field}`);
  return value as number;
}

function nonNegative(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`INVALID_MODEL_DRIFT:${field}`);
  return value;
}

function identifier(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._:-]{1,120}$/.test(value)) throw new Error(`INVALID_MODEL_DRIFT:${field}`);
  return value;
}

function parseBaseline(value: unknown, index: number): ModelDriftBaseline {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`INVALID_MODEL_DRIFT:baseline:${index}`);
  const raw = value as Record<string, unknown>;
  return {
    detectorId: identifier(raw.detectorId, `baseline_detector:${index}`),
    samples: positiveInteger(raw.samples, `baseline_samples:${index}`),
    meanScore: boundedRatio(raw.meanScore, `baseline_mean:${index}`),
    scoreStdDev: nonNegative(raw.scoreStdDev, `baseline_stddev:${index}`),
    detectedRate: boundedRatio(raw.detectedRate, `baseline_detected:${index}`),
    oodRate: boundedRatio(raw.oodRate, `baseline_ood:${index}`),
  };
}

export function parseModelDriftPolicy(value: unknown): ModelDriftPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_MODEL_DRIFT:policy");
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== "model-drift-policy.v1") throw new Error("INVALID_MODEL_DRIFT:schemaVersion");
  const policyVersion = identifier(raw.policyVersion, "policyVersion");
  const windowSize = positiveInteger(raw.windowSize, "windowSize");
  const minimumWindowSamples = positiveInteger(raw.minimumWindowSamples, "minimumWindowSamples");
  const maxMeanZScore = nonNegative(raw.maxMeanZScore, "maxMeanZScore");
  const maxDetectedRateDelta = boundedRatio(raw.maxDetectedRateDelta, "maxDetectedRateDelta");
  const maxOodRate = boundedRatio(raw.maxOodRate, "maxOodRate");
  if (!Array.isArray(raw.baselines)) throw new Error("INVALID_MODEL_DRIFT:baselines");
  const ids = new Set<string>();
  const baselines = raw.baselines.map(parseBaseline);
  for (const baseline of baselines) {
    if (ids.has(baseline.detectorId)) throw new Error(`INVALID_MODEL_DRIFT:duplicate_baseline:${baseline.detectorId}`);
    ids.add(baseline.detectorId);
  }
  return { schemaVersion: "model-drift-policy.v1", policyVersion, windowSize, minimumWindowSamples, maxMeanZScore, maxDetectedRateDelta, maxOodRate, baselines };
}

function ratio(numerator: number, denominator: number): number | null { return denominator > 0 ? numerator / denominator : null; }

export class ModelDriftMonitor {
  private readonly observations = new Map<string, ModelDriftObservation[]>();

  constructor(private readonly policy: ModelDriftPolicy) {}

  observe(observation: ModelDriftObservation): void {
    if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(observation.detectorId)
      || typeof observation.timestamp !== "string"
      || (observation.score !== null && (!Number.isFinite(observation.score) || observation.score < 0 || observation.score > 1))) return;
    const values = this.observations.get(observation.detectorId) || [];
    values.push({ ...observation });
    while (values.length > this.policy.windowSize) values.shift();
    this.observations.set(observation.detectorId, values);
  }

  assess(detectorId: string): ModelDriftAssessment {
    const values = this.observations.get(detectorId) || [];
    const baseline = this.policy.baselines.find((item) => item.detectorId === detectorId) || null;
    const scored = values.filter((item): item is ModelDriftObservation & { score: number } => typeof item.score === "number");
    const meanScore = ratio(scored.reduce((sum, item) => sum + item.score, 0), scored.length);
    const detectedRate = ratio(values.filter((item) => item.outcome === "detected").length, values.length);
    const oodRate = ratio(values.filter((item) => item.outOfDistribution === true).length, values.length);
    const alerts: string[] = [];
    if (!baseline) return { detectorId, samples: values.length, status: "no_baseline", current: { meanScore, detectedRate, oodRate }, baseline, alerts: ["baseline_missing"], shadowEvaluationRequired: true, automaticPolicyMutation: false };
    if (values.length < this.policy.minimumWindowSamples) alerts.push("window_samples_insufficient");
    if (meanScore !== null && baseline.scoreStdDev > 0 && Math.abs(meanScore - baseline.meanScore) / baseline.scoreStdDev > this.policy.maxMeanZScore) alerts.push("score_mean_drift");
    if (detectedRate !== null && Math.abs(detectedRate - baseline.detectedRate) > this.policy.maxDetectedRateDelta) alerts.push("detected_rate_drift");
    if (oodRate !== null && oodRate > this.policy.maxOodRate) alerts.push("ood_rate_high");
    const insufficient = values.length < this.policy.minimumWindowSamples;
    const alert = !insufficient && alerts.length > 0;
    return {
      detectorId,
      samples: values.length,
      status: insufficient ? "insufficient_data" : alert ? "alert" : "clear",
      current: { meanScore, detectedRate, oodRate },
      baseline,
      alerts,
      shadowEvaluationRequired: alert || insufficient,
      automaticPolicyMutation: false,
    };
  }

  snapshot(generatedAt = new Date().toISOString()): ModelDriftSnapshot {
    const ids = new Set([...this.observations.keys(), ...this.policy.baselines.map((item) => item.detectorId)]);
    return { schemaVersion: "model-drift-snapshot.v1", policyVersion: this.policy.policyVersion, generatedAt, assessments: [...ids].sort().map((id) => this.assess(id)) };
  }
}

export function loadModelDriftPolicy(): ModelDriftPolicy {
  return parseModelDriftPolicy(JSON.parse(readFileSync(fileURLToPath(new URL("../resources/model-drift-policy.v1.json", import.meta.url)), "utf8")) as unknown);
}
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
