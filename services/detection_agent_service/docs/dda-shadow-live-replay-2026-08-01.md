# DDA universal candidate live-worker replay - 2026-08-01

## Scope

- Source manifest: `AIGI-Eval-Sampled-seed3521-n64/manifest_dda11_9920.jsonl`.
- Source manifest SHA-256:
  `388c7fb49975e26ebeb85fc2182ca634c0fe93f38d668cbab51b5a0030df217e`.
- Deterministic selection: seed 3521, 16 subgroups, one source-labelled real
  image and one source-labelled generated image per subgroup.
- Total records: 32 unique assets, processed through the exact resident online
  DDA worker and `dda-rgb-resize336-clipnorm.v1` preprocessing path.
- Active baseline: `DDA-official-neurips2025`, checkpoint
  `b27a31d39374803ddeff02bfabb2be76e190b04300490cddfafb24f683f37e3e`.
- Shadow candidate:
  `DDA-universal-universal_allv_g2_r025_w100_seed5291_v1_step128`, checkpoint
  `c115caaa33d200d6b014f056acb973a369cceeaa139b27b1bd8a9a7dd6f86352`.
- Candidate selection manifest SHA-256:
  `84e8f988de9fa5013bbfd6d39b748804ab99cd173509878c583bacd05627b8ba`.

Both workers ran on `cuda:1` sequentially within the bounded replay harness.
The first attempted directory stopped after 14 records because `.jfif` was not
mapped to `image/jpeg`; the mapping was added and the replay was restarted in a
new directory. Only the complete `_v2` artifact set below is acceptance evidence.

## Results

| Metric | Active c0 | Universal candidate | Delta |
| --- | ---: | ---: | ---: |
| Accuracy | 78.125% | 87.500% | +9.375 pp |
| Generated-image recall | 62.500% | 81.250% | +18.750 pp |
| Real-image false-positive rate | 6.250% | 6.250% | 0 pp |
| Failures | 0 | 0 | 0 |
| Latency p50 | 610.758 ms | 609.108 ms | -1.650 ms |
| Latency p95 | 809.620 ms | 831.715 ms | +22.095 ms |

The routes agreed on 29 of 32 assets (90.625%). The mean candidate-minus-c0
score delta was `+0.0987367189`. All 32 audit records were paired with the
source-owned truth records by asset SHA-256.

## Immutable artifacts

Complete output directory:
`experiments/dda_universal_v1/live_replay/dda11_seed3521_d16_p1_20260801_v2`.

| Artifact | SHA-256 |
| --- | --- |
| `audit.jsonl` | `4d53984edca7817025cc9a506a6e41610d243dbf28520173792bb83f560d0c63` |
| `truth.jsonl` | `784dfbdf9cf63c59bcdefb93b6ef6dca05ccb330b557dbfc26a134e3e50bfc90` |
| `selection.jsonl` | `6e96123586b72f0a3cc5fe5817a161409c2174b9a7d7715079f6da145c3ae96b` |
| `report.json` | `124ddeb3f5a7a3d9d37381bdeec41a8adcf3d88b99000235f1cd2e1c643783a5` |
| `review-assessment-final-v1.json` | `4ecad8bdd3e2a1a272a7379d2e8cfc1170da9e8323b130c8c7906d6742688beb` |

The replay manifest binds these digests and both checkpoint identities. Every
private artifact has mode `0600`. Audit records omit filenames and local paths,
carry `decisionAuthority: none`, and carry `productionSwapAuthorized: false`.
The evaluator reports `observational_only`, `promotionAuthorized: false`, and
`automaticPolicyMutation: false`. The active policy was not mutated.

## Review gate

The final private assessment uses profile `dda-universal-shadow-review.v1`,
profile SHA-256
`53bedf134331421a0c2ecfc3b1ce49f0043bb39085196abad70abb3b63bd9c2f`.
It binds the exact audit and truth digests above and compares accuracy only on
source-labelled records completed by both c0 and the candidate.

The current replay passes only the exact candidate-identity criterion. The
remaining 12 criteria are `insufficient`, including seven-day observation,
10,000 unique assets, operational rates, 2,000 paired labels, 1,000 real and
1,000 generated samples, and sufficiently populated subgroups. The observed
recall, false-positive rate, accuracy delta, and p95 ratio remain visible but do
not pass or fail before their applicable sample-volume requirements are met.
The assessment reports `eligibleForManualPromotionReview: false`,
`productionPromotionAuthorized: false`, and `automaticPolicyMutation: false`.

## Interpretation

This bounded replay proves exact online-path compatibility, failure isolation,
artifact reproducibility, and a favorable direction on a diverse source-labelled
slice. It is too small for deployment calibration or subgroup claims. It does
not replace the larger offline evaluation, untouched deployment-domain data,
transformation robustness, sustained production shadow traffic, capacity tests,
or an explicit immutable promotion bundle. The candidate remains shadow-only.
