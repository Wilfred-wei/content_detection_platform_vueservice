# Model-Enabled Local Smoke

Date: 2026-08-05

Command:

```bash
cd services/detection_agent_service
node --import tsx --test test/model-enabled-smoke.test.ts
```

The smoke passed through the direct-evidence barrier, enabled the registered model route, normalized a strict detector result, preserved that result as supporting evidence, generated a bounded explanation, ran four polarity checks, and sealed the report. The final product decision stayed `INCONCLUSIVE` because the smoke assessor is intentionally absent and model calibration is not production-authoritative.

This is a route and report-integrity smoke using a deterministic in-process detector. It is not a GPU benchmark, model-accuracy result, or production promotion.
