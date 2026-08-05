# Provenance Acceptance Status

The provenance registry and evaluator are intentionally conservative. A worker
unit test proves protocol and pinned-artifact behavior; it does not approve a
short-circuit detector. Approval requires the immutable release-gate registry,
at least 10,000 unmarked controls, all declared transformations, complete
multi-view calibration, and a reviewable evaluation artifact.

## What is executable now

Run the local protocol and artifact checks from `services/detection_agent_service`:

```bash
npm run test:watermark-worker
npm run test:trustmark-worker
npm run test:meta-watermarks-worker
npm run test:image-view-worker
npm run evaluate:provenance-manifest
npm run evaluate:provenance-transformations
```

The TypeScript test suite also checks completion-order handling, neutral absence,
payload binding, invalid signatures, visible-mark supporting-only semantics, and
short-circuit release-gate bypasses. The checked-in evaluation manifest covers
15 cases across the current registered schemes (9 watermark positives, 2
metadata, 2 C2PA, and 2 unmarked controls), and the transformation suite has
13 recipes. Both are explicitly marked `releaseGateEligible=false`.

The acceptance-contract test derives a complete matrix from the registry: all
seven current short-circuit candidates, all nine acceptance scenarios, and both
barrier traces pass. This is a coverage and control-flow result only; synthetic
observations do not become detector accuracy evidence.

## Offline observation collection

The registered local watermark adapters can now be exercised from a strict
case JSONL without hand-authoring observation records:

```bash
npm run collect:provenance-observations -- \
  --input test/fixtures/provenance-observation-case.trustmark.jsonl \
  --root . \
  --output /tmp/trustmark-observations.jsonl \
  --generated-at 2026-08-05T02:00:00.000Z
npm run evaluate:provenance-schemes -- \
  --input /tmp/trustmark-observations.jsonl \
  --generated-at 2026-08-05T02:00:01.000Z
```

The collector verifies every asset digest, prevents path traversal, validates
the registered scheme/profile, runs adapters sequentially, records wall-clock
latency and process CPU time, and preserves unavailable, unsupported, timeout,
and error outcomes. A TrustMark P official fixture smoke produced one positive
payload view but a negative final result under the configured two-consistent-
view policy; this is compatibility evidence, not a calibration pass.

## Current release state

All short-circuit gate entries remain `decision=incomplete`. The reasons are
deliberate, not worker failures:

- the small fixture set is not a 10,000-control false-positive corpus;
- transformed-view and multi-view thresholds have not been calibrated on the
  complete procedure;
- TrustMark, Stability-compatible, and Meta profiles need deployment-domain
  evaluation artifacts before they can become strong evidence;
- visible marks are visual supporting evidence only and never verify an issuer.

Until those artifacts exist, the runtime executes the detectors when configured,
preserves positive/negative/unavailable/error outcomes, and prevents every
strong result from triggering an early model short-circuit.
