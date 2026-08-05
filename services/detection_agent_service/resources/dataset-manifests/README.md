# Dataset manifests

`aigi-eval-sampled-seed3521-n64.v1.json` is a reproducible, research-only
manifest generated from the local fixed sample at
`/sdb/data_public/weiwenfei_datasets/AIGI-Eval-Sampled-seed3521-n64`.

The manifest records every sample's digest, real/AI label, benchmark/domain,
generator when applicable, explicit generator role (`owned`, `held_out`, or
`unknown`), split, and rights provenance. Its
`rightsPolicy=research_only` value is intentional: a dataset card's Apache
license does not automatically clear the underlying MS-COCO, ImageNet, web,
or generator outputs for commercial use. The manifest must not be used as a
production training or redistribution authorization until each source is
reviewed, generator ownership/holdout roles are declared, and a new
`commercial_cleared` revision is generated.

Regenerate it with:

```bash
cd services/detection_agent_service
npm run build:sampled-dataset-manifest -- \
  --root /sdb/data_public/weiwenfei_datasets/AIGI-Eval-Sampled-seed3521-n64 \
  --input /sdb/data_public/weiwenfei_datasets/AIGI-Eval-Sampled-seed3521-n64/manifest.jsonl \
  --output resources/dataset-manifests/aigi-eval-sampled-seed3521-n64.v1.json
```

For a reviewed revision, pass exact generator names with comma-separated
`--owned-generators` and `--held-out-generators` lists. Names in both lists are
rejected; names in neither list stay `unknown`.

The command hashes image bytes and therefore can take time on the full sample.

Verify an existing revision against the source directory before using it in an
evaluation or training job:

```bash
npm run verify:dataset-manifest -- \
  --root /sdb/data_public/weiwenfei_datasets/AIGI-Eval-Sampled-seed3521-n64 \
  --manifest resources/dataset-manifests/aigi-eval-sampled-seed3521-n64.v1.json \
  --expected-rights-policy research_only
```

The verification output also includes derived resolution statistics computed
from the verified image bytes: width and height range, mean, median, P95,
orientation, aspect-ratio buckets, common dimensions, and real-versus-
generated subsets. These statistics are emitted during verification rather
than stored in the manifest, so a resolution summary cannot become stale
without the asset digest check noticing the underlying change.

The 2026-08-05 verification passed for all 16,064 assets (5,952 real and
10,112 generated). The resolution slice is recorded in
`docs/dataset-resolution-summary-2026-08-05.md`. It is still an
evaluation/research manifest, not a commercial training authorization.
