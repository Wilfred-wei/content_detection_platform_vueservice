# Dataset resolution summary - 2026-08-05

Source manifest: `aigi-eval-sampled-seed3521-n64.v1`  
Source root: `/sdb/data_public/weiwenfei_datasets/AIGI-Eval-Sampled-seed3521-n64`

The verification run checked all 16,064 asset digests and computed dimensions
from the verified bytes. `16,046` images had parseable dimensions and `18`
did not.

## Overall

| Metric | Value |
| --- | ---: |
| Width range | 100 - 7,952 |
| Width mean / p50 / p95 | 789.55 / 640 / 1,328 |
| Height range | 100 - 7,285 |
| Height mean / p50 / p95 | 732.93 / 576 / 1,328 |
| Landscape / portrait / square | 4,803 / 1,769 / 9,474 |

Most common exact sizes are `1024x1024` (4,583), `256x256` (2,125),
`512x512` (844), `640x480` (786), and `1328x1328` (768).

## Label slices

| Label | With dimensions | Width p50 | Height p50 | Square |
| --- | ---: | ---: | ---: | ---: |
| real | 5,942 / 5,952 | 612 | 459 | 983 |
| ai_generated | 10,104 / 10,112 | 1,024 | 1,024 | 8,491 |

This is a material dataset caveat: AI samples are overwhelmingly square and
larger, while real samples are mostly natural photographic aspect ratios. A
model trained or calibrated directly on this distribution can learn resolution
or aspect-ratio artifacts instead of generation evidence. Resolution-balanced
sampling and matched real/AI controls are required for the next training
revision.

The machine-readable output is produced by:

```text
npm run verify:dataset-manifest -- \
  --root /sdb/data_public/weiwenfei_datasets/AIGI-Eval-Sampled-seed3521-n64 \
  --manifest resources/dataset-manifests/aigi-eval-sampled-seed3521-n64.v1.json \
  --expected-rights-policy research_only
```
