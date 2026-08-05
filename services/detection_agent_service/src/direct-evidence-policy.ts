export type DirectEvidenceCollectorId = "c2pa" | "registered_watermarks" | "metadata";

export interface DirectEvidencePolicy {
  schemaVersion: "direct-evidence-policy.v1";
  policyVersion: string;
  scheduledCollectors: readonly DirectEvidenceCollectorId[];
  strongProvenanceCollectors: readonly DirectEvidenceCollectorId[];
  collectorDeadlineMs: number;
  barrier: "all_scheduled_terminal";
  requireConflictCheckBeforeShortCircuit: true;
  stopUnscheduledModelWorkOnVerifiedAiOrigin: true;
}

export const ACTIVE_DIRECT_EVIDENCE_POLICY: DirectEvidencePolicy = Object.freeze({
  schemaVersion: "direct-evidence-policy.v1",
  policyVersion: "local-provenance-completion-barrier-v1-2026-08-02",
  scheduledCollectors: Object.freeze(["c2pa", "registered_watermarks", "metadata"] as const),
  strongProvenanceCollectors: Object.freeze(["c2pa", "registered_watermarks"] as const),
  collectorDeadlineMs: 30_000,
  barrier: "all_scheduled_terminal",
  requireConflictCheckBeforeShortCircuit: true,
  stopUnscheduledModelWorkOnVerifiedAiOrigin: true,
});

export function validateDirectEvidencePolicy(policy: DirectEvidencePolicy): void {
  const scheduled = new Set(policy.scheduledCollectors);
  if (
    policy.schemaVersion !== "direct-evidence-policy.v1"
    || !policy.policyVersion.trim()
    || scheduled.size !== policy.scheduledCollectors.length
    || !["c2pa", "registered_watermarks", "metadata"].every((id) => scheduled.has(id as DirectEvidenceCollectorId))
    || policy.strongProvenanceCollectors.some((id) => !scheduled.has(id))
    || !Number.isInteger(policy.collectorDeadlineMs)
    || policy.collectorDeadlineMs < 1
    || policy.collectorDeadlineMs > 120_000
    || policy.barrier !== "all_scheduled_terminal"
    || policy.requireConflictCheckBeforeShortCircuit !== true
    || policy.stopUnscheduledModelWorkOnVerifiedAiOrigin !== true
  ) {
    throw new Error("INVALID_DIRECT_EVIDENCE_POLICY");
  }
}

export async function runDirectEvidenceCollector<T>(
  collectorId: DirectEvidenceCollectorId,
  policy: DirectEvidencePolicy,
  operation: () => Promise<T>,
  fallback: (error: Error) => T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`DIRECT_EVIDENCE_COLLECTOR_TIMEOUT:${collectorId}`)),
          policy.collectorDeadlineMs,
        );
        timer.unref?.();
      }),
    ]);
  } catch (error) {
    return fallback(error instanceof Error ? error : new Error(`DIRECT_EVIDENCE_COLLECTOR_ERROR:${collectorId}`));
  } finally {
    if (timer) clearTimeout(timer);
  }
}
