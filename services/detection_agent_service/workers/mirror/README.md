# MIRROR worker

This worker runs the MIRROR detector as an experimental, non-production
supporting signal. It uses the `model-detector.v1` JSON-lines protocol and
keeps the model resident between requests.

## Required assets

The runtime requires all three asset groups to exist locally before
`MIRROR_ENABLED=true` is accepted:

| Asset | Local filename | Upstream source |
| --- | --- | --- |
| Phase 2 checkpoint | `checkpoint-h-cur.pth` | MIRROR README, Google Drive ID `1gos1QgZA4Xuj706oa5i5E6vsOAoaLyr3` |
| Phase 1 memory bank | `mirror_phase1.pth` | MIRROR README, Google Drive ID `1CpgltI-F7JN7hDyk2O16Ix3Zr_2d2-G0` |
| DINOv3 H+ backbone | directory named `dinov3-huge` | `facebook/dinov3-vith16plus-pretrain-lvd1689m` |

The directory name must contain `huge` because the upstream MIRROR builder
uses that substring to select the feature dimension.

Recommended local layout:

```text
/sdb/data_public/weiwenfei_datasets/model_zoo/mirror_official/
  checkpoint-h-cur.pth
  mirror_phase1.pth
  dinov3-huge/
    config.json
    model.safetensors
```

After placing the two checkpoint files, calculate and pin their identities:

```bash
sha256sum \
  /sdb/data_public/weiwenfei_datasets/model_zoo/mirror_official/checkpoint-h-cur.pth \
  /sdb/data_public/weiwenfei_datasets/model_zoo/mirror_official/mirror_phase1.pth
```

Set every `MIRROR_*_SHA256` value in the service environment. The service
refuses to enable MIRROR when a revision or digest is missing, and the worker
checks the same identities again before loading the model.

`MIRROR_USE_AMP` must remain `false`. The pinned upstream attention code masks
logits with `-1e9`, which overflows under FP16 autocast.

## Environment

Install the pinned worker environment with UV:

```bash
uv sync --project workers/mirror --frozen
```

MIRROR remains disabled in production configuration. Its repository advertises
MIT in the README, but the checked source revision and published checkpoints do
not include sufficient license metadata for a production/commercial approval.
