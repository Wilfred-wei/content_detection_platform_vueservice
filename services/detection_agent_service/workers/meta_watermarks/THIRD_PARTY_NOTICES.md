# Third-Party Notices

This worker provisions and executes the following upstream projects and artifacts:

- Meta VideoSeal source, VideoSeal v1.0, PixelSeal, and ChunkySeal checkpoints: MIT License, pinned to commit `870ca7fb33578b90f14c602016b6c2788096226e`.
- Meta Watermark Anything source and `wam_mit` checkpoint trained on SA-1B: MIT License, pinned to commit `2c08af04d037d5667c02f6ddebbda9ff04581c3e`.
- PyTorch and torchvision: BSD-style licenses.
- PyAV: BSD-3-Clause.
- Pillow: HPND.
- timm: Apache-2.0.
- OpenCV: Apache-2.0.
- OmegaConf: BSD-3-Clause.
- einops: MIT.

Exact dependency versions and artifact hashes are recorded by `uv.lock`; the respective upstream notices and licenses continue to apply.

The WAM checkpoint trained on COCO and Meta Stable Signature artifacts are intentionally excluded because their published terms are noncommercial.
