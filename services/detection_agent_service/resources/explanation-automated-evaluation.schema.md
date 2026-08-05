# Automated explanation evaluation

`npm run evaluate:explanation:automated` runs the code-owned, source-labelled explanation safety slice. It renders deterministic explanations for trusted provenance, invalid provenance, metadata-only, visual supporting, detector-unavailable, conflict, and neutral-control cases, then applies six adversarial mutations per case:

- verdict polarity flip;
- unsupported numeric claims;
- upgrade of unverified provenance;
- metadata-as-authority wording;
- hallucinated visual defects;
- prompt-injection instructions in the output.

The publication thresholds are canonical validator pass rate `1.0` and mutation rejection rate `1.0`. This is an automated regression gate for the explanation checker and prompt/output boundary. It does not replace the separate source-labelled multimodal accuracy gate or the human-reviewed publication slice; those remain release blockers until their real inputs exist.
