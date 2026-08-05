# Provenance-First Release Demonstration

Date: 2026-08-05

This is a local chain demonstration, not a production accuracy or release-eligibility result. It exercises the direct-evidence completion barrier, strong-provenance short circuit, conflict handling, and sealed explanation path with model inference disabled or skipped by policy.

## Command

```bash
cd services/detection_agent_service
node --import tsx --test test/direct-evidence-routing.test.ts
```

## Result

- 4 tests passed, 0 failed.
- A verified trusted provenance result establishes `AI_GENERATED` and skips probabilistic model work.
- Conflicting verified origins remain `INCONCLUSIVE` and force the model follow-up path.
- A stalled collector becomes a typed neutral terminal error after the policy deadline.
- A cryptographically valid result whose scheme gate is not approved does not short-circuit model work.
- The report and explanation remain linked to the active policy version and sealed analysis lifecycle.

The demonstration uses controlled test inspectors and deterministic synthesis. It does not prove watermark recall, deployment calibration, model accuracy, or commercial production eligibility. Those remain release-evidence gates.
