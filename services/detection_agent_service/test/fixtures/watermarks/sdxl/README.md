# SDXL invisible-watermark fixtures

The worker integration test creates deterministic 512x512 image bytes with NumPy seed `20260728`, embeds the Diffusers SDXL 48-bit payload `b3ec907bb19e` with the pinned MIT DWT-DCT compatibility implementation, and verifies exact decoding. The generated fixture remains temporary so the repository does not store a large opaque binary.

The test is a compatibility fixture, not a false-positive calibration corpus. Production short-circuiting remains disabled until the separate evaluation gate passes.
