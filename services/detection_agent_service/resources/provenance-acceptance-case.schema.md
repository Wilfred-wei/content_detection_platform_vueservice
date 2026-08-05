# Provenance acceptance cases

`provenance-acceptance-case.v1` is an evaluation-only JSONL contract. It binds one acceptance scenario to a registered scheme/profile and either one collected observation or one execution trace.

The evaluator requires every scheme whose registry policy is `candidate_after_gate` or `eligible` to cover all nine scenarios:

- `unmarked_control`
- `forged_label`
- `forged_metadata`
- `invalid_signature`
- `unknown_key`
- `transformation_robustness`
- `false_positive`
- `completion_order`
- `early_exit`

Negative scenarios must finish with an explicit `negative` observation. `unavailable`, `unsupported`, `timeout`, and `error` are failures for an acceptance run, not false positives or negatives. Transformation robustness must finish with an explicit positive observation for the marked sample. Completion-order and early-exit cases use `provenance-acceptance-trace.v1` and verify that the direct-evidence barrier precedes model invocation, and that authorized early exit prevents model invocation and rejects late authoritative writes.

Run it with:

```bash
npm run evaluate:provenance-acceptance -- \
  --cases /path/to/cases.jsonl \
  --observations /path/to/provenance-observations.jsonl \
  --traces /path/to/acceptance-traces.jsonl
```

The report is deliberately non-promotable. It is a correctness/coverage check and never changes the online policy or authorizes short-circuiting.

The service test suite also builds an in-memory contract matrix directly from the
registered provenance schemes. The matrix currently covers every scheme whose
registry policy is `candidate_after_gate` or `eligible`, every scenario above,
and both trace-only scenarios. This proves registry coverage and barrier
invariants without treating synthetic observations as detector accuracy. A
real release still requires collected worker observations, transformation
robustness, false-positive calibration, and the separate release-gate sample
size requirements.
