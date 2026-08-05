# Model and resolution analysis - 2026-08-05

This analysis uses the fixed-sample DDA official replay, not a release gate.
It deduplicates shared source assets, uses the same deterministic 25% real
calibration split and 1% fixed-FPR threshold as the model bundle, and applies
the configured `0.05` abstention margin. The evaluation slice contains 11,062
records; 17 records have no parseable dimensions.

For the follow-up that controls benchmark/domain composition inside each
resolution or shape cell, see
[`model-resolution-controlled-analysis-2026-08-05.md`](model-resolution-controlled-analysis-2026-08-05.md).

## Longest-side slices

| Longest side | Real / AI | Accuracy* | Real FPR | AI recall | Abstention |
| --- | ---: | ---: | ---: | ---: | ---: |
| <=256 | 572 / 989 | 67.3% | 0.00% | 35.7% | 13.0% |
| 257-512 | 1,066 / 1,433 | 93.2% | 0.47% | 75.9% | 8.9% |
| 513-1024 | 1,697 / 3,725 | 44.5% | 0.00% | 14.0% | 8.2% |
| 1025-2048 | 544 / 850 | 50.0% | 0.00% | 11.8% | 9.4% |
| >2048 | 85 / 84 | 53.8% | 1.18% | 2.4% | 7.7% |

`Accuracy*` excludes abstentions. FPR and AI recall are more useful here
because the label mix differs substantially by bucket.

## Aspect-ratio slices

| Shape | Real / AI | Accuracy* | Real FPR | AI recall | Abstention |
| --- | ---: | ---: | ---: | ---: | ---: |
| square | 725 / 5,970 | 38.1% | 0.00% | 25.9% | 11.3% |
| landscape | 2,390 / 796 | 91.9% | 0.25% | 51.6% | 6.1% |
| portrait | 849 / 315 | 86.7% | 0.00% | 33.7% | 5.6% |

## Interpretation

Resolution and shape are strongly associated with the observed DDA result, but
this replay does not prove that resolution alone causes the errors. The source
dataset itself has a strong shortcut: AI images are mostly square and have a
`1024x1024` median, while real images have roughly a `612x459` median and are
mostly natural photographic aspect ratios. Generator family, compression,
content, and resolution are therefore confounded.

The official DDA score also falls sharply on larger images in this replay. That
can reflect resize/interpolation mismatch in the fixed online preprocessing,
generator-family coverage, or learned artifact bias. The ICR candidate is not
diagnostic at this threshold: all generated detections fall inside the
abstention margin, so its measured AI recall is zero.

## Required control before training conclusions

1. Build real/AI matched pairs in each resolution and aspect-ratio bucket.
2. Keep generator and source-domain quotas balanced inside every bucket.
3. Evaluate the same images after controlled resize, crop, recompression, and
   screenshot transformations.
4. Add a resolution-only baseline using width, height, megapixels, aspect ratio,
   and compression metadata. A high baseline would confirm shortcut leakage.
5. Report per-resolution FPR, AI recall, abstention, calibration, and latency in
   every future model bundle; do not use overall accuracy alone.

The underlying dataset distribution is recorded in
`dataset-resolution-summary-2026-08-05.md`.
