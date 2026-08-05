# Automated multimodal evaluation

`automated-multimodal-case.v1` binds a rights-cleared, source-labelled image to an expected three-way verdict, a base asset, a deterministic transformation, and an optional prompt-injection flag. Runtime outputs are supplied separately as typed observations so an evaluator cannot silently treat a missing model result as a correct negative.

The evaluator reports three-way accuracy, real-image false positives, generated-image false negatives, abstention, confidence calibration and overconfidence, transformation stability, critic coverage/challenge and unsupported-reason suppression, unsupported-claim rate, prompt-injection robustness, p95 latency, and failure rate. All publication thresholds are explicit and the report is non-authoritative.

The checked-in command currently runs with an empty input and therefore exits with status `3`. Populate it only from rights-cleared source-labelled assets and actual Pi multimodal outputs:

```bash
npm run evaluate:multimodal:automated -- \
  --cases /path/to/cases.json \
  --observations /path/to/observations.json
```

Both files are JSON arrays. Each observation must contain `caseId`, `assessment` (the sealed `AiAuthenticityAssessmentRecord`, or `null` for a failed run), `latencyMs`, and `unsupportedClaimCount`.

The local smoke test and unit fixtures validate the evaluator contract; they do not authorize production model or prompt promotion.
