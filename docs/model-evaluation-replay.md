# Model Evaluation Replay

The Agent keeps model evaluation descriptive until a rights-cleared, untouched
deployment manifest and a reviewed release bundle are available. `evaluate:models`
therefore applies the versioned production policy in
`services/detection_agent_service/resources/model-evaluation-policy.v1.json` and
will refuse promotion when the source sidecar is absent or declares
`productionGateEligible=false`.

## Build records from the local DDA replay

The DDA v2 replay files are outside this repository and remain the source of
truth for their own experiment. Build one record set per suite; do not combine
DDA-11 with T2I because both reuse real controls.

```bash
cd services/detection_agent_service

npm run build:model-records -- \
  --input /sda/home/temp/weiwenfei/newAI/experiments/dda_universal_v1/evaluation/universal_allv_g2_r025_w100_seed5291_v1_dda11_step128/predictions.jsonl \
  --output /private/dda-v2-dda11-records.json \
  --detector-id dda-dinov2-lora \
  --dataset-id dda-v2-seed5291-dda11 \
  --dataset-manifest resources/dataset-manifests/aigi-eval-sampled-seed3521-n64.v1.json \
  --deduplicate-shared-assets

npm run evaluate:models -- \
  /private/dda-v2-dda11-records.json \
  /private/dda-v2-dda11-report.json
```

`--deduplicate-shared-assets` is explicit. Without it, a reused source image
fails the command. With it, only one record is retained and the generated
`.meta.json` records the duplicate count and the first 200 duplicate IDs. A
conflicting label for the same source asset always fails.

## Current replay result

The 2026-08-04 local replay produced these descriptive results:

| Suite | Records after shared-control deduplication | Fixed-FPR result | Production gate |
| --- | ---: | --- | --- |
| DDA-11 v2 seed 5291 | 9,593 | At 1% target FPR, generated recall 0% | Blocked |
| T2I v2 seed 5291 | 768 | Calibration controls insufficient; observed generated recall about 44.8% | Blocked |

These numbers are not a new checkpoint evaluation and do not authorize a model
swap. The replay is useful because it makes the failure visible: a threshold
that keeps real-image false positives near 1% can eliminate generated recall.
The next model work must improve the score separation or use a formally
reviewed staged policy, not silently lower the threshold.

The records are intentionally not committed here: they reference external
datasets and their licensing/provenance review is maintained with the dataset
manifests. The builder now records the manifest SHA-256, revision, rights policy,
sample count, and generator-role counts in the sidecar. The checked-in sampled
manifest is explicitly `research_only` and its generated samples are
`unknown` ownership, so attaching it improves auditability but cannot make the
replay production-eligible. A future commercial-cleared revision must be
generated after source terms and generator ownership are reviewed.

## Candidate bundle comparison

When multiple candidates were scored on the same samples, build one records file
per detector with the same `--dataset-id`, then compare them without averaging
raw scores:

```bash
npm run evaluate:model-bundle -- \
  --input /private/dda-primary-records.json \
  --input /private/dda-complementary-records.json \
  --output /private/dda-candidate-bundle.json
```

The bundle aligns sample IDs, rejects duplicate or conflicting labels, reports
generator/subgroup and transformation metrics, and computes pairwise error
overlap. Missing sidecars, uncalibrated inputs, insufficient shared controls,
or a failed candidate gate keep `promotable=false`.

The 2026-08-04 local DDA-11 comparison used two seed-3521 candidates on 9,593
shared records. Both remained blocked by the source eligibility gate; at the
1% fixed-FPR operating point both had zero generated recall, and their error
sets overlapped at Jaccard 0.9697. This is a comparison result, not a reason to
fuse or promote either checkpoint.
