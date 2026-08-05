# Fixed-sample model comparison - 2026-08-05

This is a descriptive replay of the locally available DDA prediction files. It is
not a release or deployment authorization.

## Inputs

- Dataset: `aigi-fixed-sample-seed3521`, sampled from the local AIGI evaluation
  tree; the attached manifest is research-only and does not declare commercial
  rights or owned/held-out generator roles.
- Candidates: `dda-dinov2-lora-official-fixed-sample` and
  `dda-dinov2-lora-icr-fixed-sample`.
- Records: 15,737 unique records per candidate after deduplicating the shared
  asset paths; all 15,737 sample IDs are shared between candidates.
- Split: deterministic 25% calibration by content-group hash, 1% target fixed
  false-positive rate, 0.05 abstention margin.
- Reproduction command:

  ```text
  npm run build:model-records -- --input <predictions.jsonl> --output <records.json> \
    --detector-id <id> --dataset-id aigi-fixed-sample-seed3521 \
    --dataset-manifest resources/dataset-manifests/aigi-eval-sampled-seed3521-n64.v1.json \
    --calibration-percent 25 --salt fixed-sample-v1 --deduplicate-shared-assets
  npm run evaluate:model-bundle -- --input <official-records.json> \
    --input <icr-records.json> --output <bundle.json> --minimum-shared-samples 100
  ```

## Results

| Candidate | Fixed-FPR threshold | Real FPR | Generated recall | Abstention | ECE |
| --- | ---: | ---: | ---: | ---: | ---: |
| official | 0.92718 | 0.15% | 29.12% | 9.18% | 0.2222 |
| ICR | 0.92288 | 0% | 0% | 31.08% | 0.1255 |

The pairwise error overlap is 3,320 shared errors over a 4,549-sample error
union (Jaccard 0.7298). The source contains only `original` transformation
records, so transformation robustness is not established by this replay.
Several generator/domain slices are near chance or have zero generated recall;
these are useful training diagnostics, not evidence of generalization.

Both candidates remain non-promotable because the production generated-recall
gate is not met, and the source manifest/metadata eligibility gate is false.
The machine-readable report used for this note is generated at
`/tmp/agent-dda-fixed-sample-bundle.json` during the local run and must be
reproduced from the pinned input files before any release decision.
