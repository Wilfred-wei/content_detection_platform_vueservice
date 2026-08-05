# Model evaluation records

The JSON input to `npm run evaluate:models -- <records.json>` is an array of records. The calibration partition contains real/unmarked controls only; the evaluation partition is immutable and must contain source-labelled real and AI-generated images. Each record binds one detector, one sample, one subgroup, one generator (when known), one deterministic transformation, the raw score, and latency.

Use a separate sample id for every source image and transformation. Keep real and generated counts balanced by subgroup and generator where possible. Do not mix calibration and evaluation copies of the same source image. Rights, source URI, byte digest, and dataset revision belong in the surrounding dataset manifest and are not accepted from model output.

The evaluator freezes the threshold from calibration, then reports fixed-FPR recall, confusion and abstention, expected calibration error, subgroup and transformation slices, p50/p95 latency, and pairwise error overlap. Insufficient volume is a non-promotable result, never a passing zero.
