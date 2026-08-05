# Third-party notices

The DWT-DCT compatibility implementation in `watermark_classic_worker.dwt_dct` is adapted from the `EmbedMaxDct` implementation in [ShieldMnt/invisible-watermark](https://github.com/ShieldMnt/invisible-watermark), used by the official Stability AI SDXL watermark path.

The worker implements the DWT-DCT and DWT-DCT-SVD decoding procedures and provisions the RivaGAN ONNX models from the exact `invisible-watermark 0.2.0` wheel. The wheel, its two model members, and the UV dependency graph are pinned by SHA-256. Runtime requests are offline.

RivaGAN was originally published by DAI-Lab under the MIT License. This service uses the ShieldMnt-distributed ONNX conversion only for a registered 32-bit payload; it does not claim compatibility with independently trained RivaGAN models.

## ShieldMnt/invisible-watermark

MIT License

Copyright (c) 2021 ShieldMnt

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
