# Release Evidence

The release decision is intentionally derived from one machine-readable report.
It does not grant deployment authority; `productionSwapAuthorized` and
`automaticPolicyMutation` remain `false` in every output.

Run it from `services/detection_agent_service`:

```bash
npm run evaluate:release-evidence -- \
  --dataset-manifest resources/dataset-manifests/aigi-eval-sampled-seed3521-n64.v1.json \
  --model-report /path/to/model-report.json \
  --output /path/to/release-evidence.json
```

Use `--dataset-root` when the source files are available locally. Without it,
the command still parses the manifest and records its digest, but it reports
that asset bytes were not reverified in this invocation.

The command aggregates:

- policy bundle and model registry integrity;
- dataset rights, explicit `owned`/`held_out` generator roles, and asset hashes;
- model evaluation promotion status;
- provenance fixtures, transformations, release-gate registry, and short-circuit status;
- explanation and multimodal forensic promotion reports.

Exit code `0` means every supplied gate passed. Exit code `3` means the report
was generated but at least one gate is blocked. A blocked report is expected
for the checked-in research manifest and pending human-review runs; it is an
auditable release stop, not a worker failure.

## Latest verification

On 2026-08-05 the command was run against the local
`AIGI-Eval-Sampled-seed3521-n64` root. All 16,064 asset digests verified. The
report remained `blocked` with `productionSwapAuthorized=false` because the
manifest is `research_only` with 10,112 unknown generator roles, the DDA report
is not promotable at the 1% fixed-FPR operating point, every short-circuit
watermark gate is incomplete, and the explanation/forensic runs contain only
pending templates without human-reviewed cases. The machine-readable output
was written to `/tmp/agent-release-evidence-20260805.json` during verification;
it is not a release artifact and must be regenerated for each source revision.
