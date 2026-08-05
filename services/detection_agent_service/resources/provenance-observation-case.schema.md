# Provenance observation case input

`collect:provenance-observations` consumes one
`provenance-observation-case.v1` JSON object per line. The file is a run plan,
not a result and does not grant production authority.

Required fields:

- `evaluationRunId`, `recordId`, and `sampleId` are stable identifiers.
- `assetPath` is relative to the `--root` argument. The collector verifies the
  file SHA-256 before invoking any worker.
- `datasetManifestSha256` and `transformationSuiteSha256` bind the observation
  to immutable evaluation inputs.
- `schemeId`, `profileId`, and `configurationId` identify the registry entry;
  unknown schemes or profiles are rejected before work starts.
- `partition` is `calibration` or `evaluation`; `label` is `marked_positive` or
  `unmarked_control`.
- `transformationId`, `transformationCategory`, and `viewPolicyId` describe the
  exact derived view and multi-view procedure. They are copied into the output,
  not inferred from filenames.

The output is strict `provenance-scheme-observation.v1` JSONL and can be passed
directly to `evaluate:provenance-schemes`. Runs are sequential by design so
that GPU-backed watermark workers do not contend for memory. A positive adapter
outcome means only that the detector's candidate policy matched; it is not
trusted provenance and cannot enable runtime short-circuiting.

