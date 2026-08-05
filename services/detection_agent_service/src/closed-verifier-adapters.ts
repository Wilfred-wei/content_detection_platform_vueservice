import { randomUUID } from "node:crypto";

import { ANALYSIS_SCHEMA_VERSION, type EvidenceRecord } from "./analysis-types.js";
import { loadProvenanceRegistry, type ProvenanceScheme } from "./provenance-registry.js";

const CLOSED_FAMILIES = new Set(["closed_vendor_verifier", "commercial_vendor_api"]);

function unavailableEvidence(analysisId: string, scheme: ProvenanceScheme, createdAt: string): EvidenceRecord {
  const disabledByPolicy = scheme.runtimeEligibility === "disabled_policy";
  return {
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    id: randomUUID(),
    analysisId,
    category: "watermark",
    source: scheme.id,
    status: disabledByPolicy ? "policy_disabled" : "detector_unavailable",
    strength: "none",
    summary: disabledByPolicy
      ? `${scheme.name} 依赖商业服务，当前非商业 API 策略未调用该检测器。`
      : `${scheme.name} 没有可用于本地生产链的公开检测器，本次未执行检测。`,
    facts: {
      schemeId: scheme.id,
      accessClass: scheme.accessClass,
      runtimeEligibility: scheme.runtimeEligibility,
      detectionAttempted: false,
      absenceEstablished: false,
      supportedProductCount: scheme.supportedProducts.length,
    },
    createdAt,
  };
}

export function collectClosedVerifierCoverage(
  analysisId: string,
  createdAt = new Date().toISOString(),
): EvidenceRecord[] {
  return loadProvenanceRegistry().schemes
    .filter((scheme) => CLOSED_FAMILIES.has(scheme.family))
    .map((scheme) => unavailableEvidence(analysisId, scheme, createdAt));
}
