# Release evidence - 2026-08-05

Command:

```text
npm run evaluate:release-evidence -- \
  --dataset-manifest resources/dataset-manifests/aigi-eval-sampled-seed3521-n64.v1.json \
  --dataset-root /sdb/data_public/weiwenfei_datasets/AIGI-Eval-Sampled-seed3521-n64 \
  --model-report /tmp/agent-dda-fixed-sample-bundle.json \
  --output /tmp/agent-release-evidence-20260805-final.json
```

Report SHA-256: `fb17188cc6c0748a6a4f627c2052a309020dc818796ebed0c6288bc132c75632`

## Result

`status=blocked`, `productionSwapAuthorized=false`, and
`automaticPolicyMutation=false`.

The dataset assets were verified: 16,064 files and about 12.03 GiB. The
manifest remains `research_only`, has no owned or held-out generator roles, and
contains 10,112 samples with unknown generator roles. This is a data-governance
block, not an asset-integrity failure.

The fixed-sample model bundle is non-promotable. The official DDA candidate
reached 29.12% generated recall at the 1% fixed-FPR gate; the ICR candidate
reached 0% under the same abstention policy. The bundle is descriptive and is
recorded separately in `model-fixed-sample-comparison-2026-08-05.md`.

The provenance registry and workers are implemented and contract-tested, but
the release gate still lacks the required large unmarked-control set,
transformation calibration, compatibility evidence, and audit identity for
each short-circuit candidate. The source-labelled explanation and multimodal
publication slices are also pending; code-owned parser and adversarial tests
pass, but no production promotion is implied.

This report must be regenerated from the pinned inputs before a release
decision. A blocked report must never be used to authorize a policy or model
swap.
