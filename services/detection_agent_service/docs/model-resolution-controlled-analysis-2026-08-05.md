# Controlled model-resolution analysis - 2026-08-05

This is an exploratory diagnostic of the released DDA checkpoint. It is not a
training-selection result and it is not a production release gate. The goal is
to separate a resolution effect from the much larger differences between
benchmarks, generators, source domains, and labels.

## Data and fixed decision rule

- Prediction source: `/sda/home/temp/weiwenfei/newAI/experiments/fixed_sample_evaluation/official/predictions.jsonl`.
- The fixed-sample replay contains 16,064 rows and 15,737 unique
  `source_path` values. Shared source paths were deduplicated before analysis.
- The frozen official replay has 11,062 evaluation records. Seventeen of them
  have no parseable dimensions, leaving 11,045 records for resolution analysis.
- The same previously frozen real-calibration split, threshold
  `0.927179753780365`, and configured `0.05` abstention rule were reused. No
  threshold, checkpoint, or subgroup was fitted on this report.
- A controlled cell is `(benchmark, domain, resolution bucket)` or
  `(benchmark, domain, shape)`. A cell is retained only when it contains at
  least four real and four AI records. Metrics are then macro-averaged over
  eligible cells, so a large benchmark cannot dominate the result.

For each eligible cell:

```text
AI recall = AI records classified as AI / AI records
real FPR  = real records classified as AI / real records
abstention = records rejected by the frozen abstention rule / all records
```

The derived balanced direction score in the tables is
`(1 - real FPR + AI recall) / 2`. It is shown only as a diagnostic summary; the
primary quantities remain class-conditional recall, FPR, and abstention.

## Resolution after domain control

| Longest side | Eligible cells | Min real / AI per cell | Macro balanced score | Macro AI recall | Macro real FPR | Macro abstention |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| <=256 | 13 | 26 / 25 | 70.3% | 40.7% | 0.00% | 10.2% |
| 257-512 | 29 | 4 / 4 | 88.5% | 77.5% | 0.55% | 12.0% |
| 513-1024 | 46 | 4 / 14 | 65.0% | 30.1% | 0.00% | 9.9% |
| 1025-2048 | 11 | 12 / 4 | 66.9% | 33.8% | 0.00% | 11.2% |
| >2048 | 1 | 45 / 45 | 50.0% | 0.0% | 0.00% | 8.9% |

The earlier unadjusted slices were 35.7%, 75.9%, 14.0%, 11.8%, and 2.4% AI
recall for the same buckets. The controlled figures are not identical because
they remove cross-domain composition effects, but the broad shape remains:
257-512 is much easier, while 513 and above is substantially harder. This is
evidence that resolution or a resolution-correlated preprocessing artifact is
part of the problem, not evidence that resolution is the sole cause. The
`>2048` cell is too sparse to support a stable conclusion.

## Shape after domain control

| Shape | Eligible cells | Min real / AI per cell | Macro balanced score | Macro AI recall | Macro real FPR | Macro abstention |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| landscape | 31 | 5 / 6 | 79.5% | 59.8% | 0.70% | 11.4% |
| portrait | 25 | 5 / 4 | 72.8% | 45.5% | 0.00% | 11.0% |
| square | 15 | 5 / 25 | 69.3% | 38.6% | 0.00% | 11.3% |

Shape remains associated with the score after benchmark/domain control. This is
consistent with a shortcut involving aspect ratio, crop policy, or the source
generator distribution. It does not tell us whether the model sees shape
directly or sees an artifact introduced when shape is normalized to the model
input.

## What the control did and did not remove

### Removed or reduced

1. **Benchmark size imbalance.** Macro-averaging over cells prevents the
   largest benchmark from deciding the result.
2. **Some domain composition bias.** Real and AI records are compared inside
   the same benchmark/domain and resolution or shape bucket.
3. **Duplicate source inflation.** Repeated `source_path` records are reduced
   to one record before the controlled grouping.

### Still confounded

1. **Generator family and label.** The manifest has 5,942 real and 10,112 AI
   rows. Among images with dimensions, the real median is roughly `612x459`,
   while the AI median is `1024x1024`; 8,491 AI images are square versus 983
   real images. Thus, a model can exploit size or shape while appearing to
   detect generation artifacts. See
   [`dataset-resolution-summary-2026-08-05.md`](dataset-resolution-summary-2026-08-05.md).
2. **Generator task type.** The official replay is strong on many classical
   pixel-generation groups but weak on modern semantic/editing groups. Examples
   from the same fixed run:

   | AIGI-Now group | Accuracy at 0.5 | AUC |
   | --- | ---: | ---: |
   | `flux-dev/semantic` | 46.1% | 0.324 |
   | `flux-kera/semantic` | 48.4% | 0.226 |
   | `flux-kontext/semantic` | 47.7% | 0.330 |
   | `flux-pro/semantic` | 48.4% | 0.438 |
   | `minimax/semantic` | 48.4% | 0.132 |
   | `jimeng/semantic` | 49.2% | 0.454 |
   | `gpt4o/pixel` | 91.4% | 0.984 |

   The controlled resolution and shape tables use the frozen fixed-FPR threshold
   `0.927179753780365`. The accuracy/AUC examples in this table are copied from
   the official replay's predeclared `0.5` operating-point summary and are used
   only to expose domain-ranking failures; they are not the same operating point.

   The semantic/pixel split is a generator-and-task variable, not a pure
   resolution variable. It needs to be matched explicitly in the next test.
3. **Compression and file history.** JPEG quality, PNG/JPEG choice, metadata,
   screenshots, platform recompression, and resampling are not balanced by the
   current manifest. These factors can survive the model's fixed input resize.
4. **Content and near-duplicate families.** Exact source paths are deduped, but
   perceptual near duplicates, repeated prompts, and related real/AI image
   families have not been clustered in this analysis.
5. **Model preprocessing.** The DDA replay resizes inputs to `336x336`. A fixed
   tensor size does not remove source-resolution effects: interpolation,
   anti-aliasing, crop/letterbox policy, and the number of native pixels that
   contribute to each patch can change the forensic signal.

## Secondary controlled transformation evidence

The DDA universal v2 robustness report is a separate, fake-heavy sample
(`879` fake and `145` real), so it must not be pooled with the fixed-sample
official replay. It is nevertheless useful as a mechanism diagnostic because
the same images were evaluated under controlled transformations with frozen
validation thresholds:

| Transform | AI recall at 1% target FPR | Achieved real FPR | AI recall at 5% target FPR | Achieved real FPR |
| --- | ---: | ---: | ---: | ---: |
| identity | 32.9% | 3.45% | 56.0% | 12.41% |
| downscale 0.5 | 32.7% | 4.14% | 53.2% | 11.72% |
| center crop 0.9 | 35.6% | 2.07% | 56.8% | 13.10% |
| Gaussian blur 1.5 | 32.4% | 6.21% | 52.2% | 19.31% |
| JPEG quality 50 | 22.5% | 0.69% | 39.4% | 11.03% |
| JPEG quality 75 | 27.4% | 2.76% | 46.2% | 11.72% |

This supports a narrower claim: the detector is sensitive to image formation and
post-processing, especially JPEG compression. It does not identify which
specific transformation explains the fixed-sample resolution gap, and the
robustness report is not a balanced production evaluation.

## Problems found

1. **The original accuracy-by-resolution view mixed two causes.** It combined
   resolution with label and generator composition. Domain-controlled results
   reduce the mixture but do not remove the association.
2. **The model's current operating point hides missed AI images.** Real FPR is
   near zero in most controlled buckets while AI recall collapses above 512
   pixels. This is a conservative detector with a large false-negative burden,
   not a generally accurate detector.
3. **A single global threshold is unlikely to serve all domains.** The semantic
   AIGI-Now groups have AUC near or below 0.5 in the fixed run, so threshold
   movement alone cannot repair their ranking.
4. **Overall accuracy is unsafe as the primary metric.** The fixed manifest is
   label-imbalanced and includes fake-only extensions. Report balanced AUC,
   class-conditional recall/FPR, abstention, and per-domain worst cases.
5. **The present controlled cells are exploratory.** Several cells have only
   four examples per class. They establish a direction for the next experiment,
   not a final estimate or a release decision.

## Next experiment: isolate causality

The next run should be a paired counterfactual study, not another aggregate
bucket plot.

### 1. Build the matched base set

- Select equal real/AI counts within each `(benchmark, generator/domain,
  semantic-or-pixel task, shape)` cell.
- Use the same number per resolution band, with a minimum of 32 per class per
  cell where possible. Keep a separate low-count exploratory tail.
- Remove exact and perceptual near duplicates across train, calibration, and
  evaluation. Freeze the source IDs before model runs.

### 2. Apply within-image counterfactuals

For every selected image, produce the same fixed variants:

```text
native
longest side 256, 512, 1024
aspect-preserving resize with fixed padding
fixed center crop
PNG with metadata stripped
JPEG quality 95, 75, 50
```

Keep the label, content, and generator constant. Use one deterministic encoder
and one deterministic resize implementation. Compare the score delta within
the same source image; this is the key test for a resolution or transformation
effect.

### 3. Fit a resolution-only leakage baseline

Train a small, separately evaluated classifier using only width, height,
megapixels, aspect ratio, file size, format, JPEG quality estimates, and
metadata-presence flags. Split by generator/domain and by near-duplicate family.
If this baseline has material AUC, the image dataset itself contains a shortcut
that must be removed or balanced before interpreting detector accuracy.

### 4. Change one model input policy at a time

Evaluate native resize, aspect-preserving padding, center crop, and multi-crop
with the same checkpoint. Do not change threshold or weights between policies.
Record per-domain AI recall, real FPR, abstention, AUC, score deltas, and latency.

### 5. Use the result to choose training corrections

- If within-image score deltas are large: add resolution/compression/crop
  augmentation and balance the transformation factors in training.
- If deltas are small but domain gaps remain: use generator/domain-balanced
  sampling and targeted semantic/editing data; resolution augmentation alone
  will not fix ranking failure.
- If the resolution-only baseline is strong: remove or balance the shortcut
  before adding more model capacity or LoRA adapters.
- Only after the base model passes this paired audit should a domain-specific
  LoRA be considered; otherwise LoRA may memorize the same shortcut faster.

## Bottom line

After controlling for benchmark/domain, resolution and shape still correlate
with DDA errors. The strongest current diagnosis is a combination of
resolution-dependent preprocessing sensitivity and a dataset shortcut created by
real/AI shape-size imbalance. Modern semantic/editing generators are a separate
and more severe ranking problem. The next actionable step is therefore a frozen,
within-image counterfactual evaluation with matched generator/domain quotas,
not simply adding more high-resolution images or lowering the global threshold.
