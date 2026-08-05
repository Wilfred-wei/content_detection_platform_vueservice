from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np
import pywt

from watermark_classic_worker.__main__ import PROTOCOL_VERSION, detect
from watermark_classic_worker.rivagan import RivaGanEncoder


EXPECTED_HEX = "b3ec907bb19e"
SVD_EXPECTED_HEX = "a17ec3d459b268f0"
RIVAGAN_EXPECTED_HEX = "c0decafe"


def embed_dwt_dct(image: np.ndarray, bits: list[int]) -> np.ndarray:
    rows, columns, _channels = image.shape
    yuv = cv2.cvtColor(image, cv2.COLOR_BGR2YUV)
    scale = 36
    block_size = 4
    for channel in (1,):
        approximation, (horizontal, vertical, diagonal) = pywt.dwt2(
            yuv[: rows // 4 * 4, : columns // 4 * 4, channel],
            "haar",
        )
        index = 0
        for row in range(approximation.shape[0] // block_size):
            for column in range(approximation.shape[1] // block_size):
                block = approximation[
                    row * block_size:(row + 1) * block_size,
                    column * block_size:(column + 1) * block_size,
                ]
                position = int(np.argmax(np.abs(block.flatten()[1:]))) + 1
                block_row, block_column = divmod(position, block_size)
                value = float(block[block_row][block_column])
                magnitude = abs(value)
                encoded = (magnitude // scale + 0.25 + 0.5 * bits[index % len(bits)]) * scale
                block[block_row][block_column] = encoded if value >= 0 else -encoded
                index += 1
        yuv[: rows // 4 * 4, : columns // 4 * 4, channel] = pywt.idwt2(
            (approximation, (vertical, horizontal, diagonal)),
            "haar",
        )
    return cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR)


def embed_dwt_dct_svd(image: np.ndarray, bits: list[int]) -> np.ndarray:
    rows, columns, _channels = image.shape
    yuv = cv2.cvtColor(image, cv2.COLOR_BGR2YUV)
    scale = 36
    block_size = 4
    approximation, (horizontal, vertical, diagonal) = pywt.dwt2(
        yuv[: rows // 4 * 4, : columns // 4 * 4, 1],
        "haar",
    )
    index = 0
    for row in range(approximation.shape[0] // block_size):
        for column in range(approximation.shape[1] // block_size):
            block = approximation[
                row * block_size:(row + 1) * block_size,
                column * block_size:(column + 1) * block_size,
            ]
            left, singular_values, right = np.linalg.svd(cv2.dct(block))
            singular_values[0] = (
                singular_values[0] // scale + 0.25 + 0.5 * bits[index % len(bits)]
            ) * scale
            block[:] = cv2.idct(left @ np.diag(singular_values) @ right)
            index += 1
    yuv[: rows // 4 * 4, : columns // 4 * 4, 1] = pywt.idwt2(
        (approximation, (vertical, horizontal, diagonal)),
        "haar",
    )
    return cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR)


def request(image_path: Path, method: str = "dwtDct", expected_hex: str = EXPECTED_HEX) -> dict:
    bit_count = len(expected_hex) * 4
    if bit_count == 32:
        thresholds = (24, 27, 29)
    elif bit_count == 64:
        thresholds = (44, 48, 52)
    else:
        thresholds = (28, 34, 36)
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "schemeId": "sdxl-invisible-watermark" if method == "dwtDct" else f"classic-{method}",
        "adapterId": "sdxl-dwt-dct-v1" if method == "dwtDct" else "classic-invisible-watermarks-v1",
        "profileId": f"{method}-{bit_count}bit-v1",
        "imagePath": str(image_path),
        "mimeType": "image/png",
        "sizeBytes": image_path.stat().st_size,
        "settings": {
            "method": method,
            "expectedPayloadHex": expected_hex,
            "expectedPayloadBits": bit_count,
            "possibleMatchMinimum": thresholds[0],
            "likelyMatchMinimum": thresholds[1],
            "veryLikelyMatchMinimum": thresholds[2],
            "decoderThreshold": 0.52,
            "maxBytes": 10 * 1024 * 1024,
            "maxPixels": 40_000_000,
            "maxCpuThreads": 2,
        },
        "artifacts": [{"id": "sdxl-default-payload-hex", "sha256": "4" * 64}],
    }


class WorkerTest(unittest.TestCase):
    def test_decodes_the_exact_sdxl_payload(self) -> None:
        rng = np.random.default_rng(20260728)
        image = rng.integers(0, 256, size=(512, 512, 3), dtype=np.uint8)
        bits = [int(bit) for bit in f"{int(EXPECTED_HEX, 16):048b}"]
        encoded = embed_dwt_dct(image, bits)

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sdxl-marked.png"
            self.assertTrue(cv2.imwrite(str(path), encoded))
            result = detect(request(path))

        self.assertEqual(result["outcome"], "possibly_present")
        self.assertEqual(result["payload"], EXPECTED_HEX)
        self.assertTrue(result["payloadMatched"])
        self.assertEqual(result["diagnostics"]["matchedBits"], 48)
        self.assertFalse(result["diagnostics"]["calibrationApproved"])

    def test_decodes_the_registered_dwt_dct_svd_payload(self) -> None:
        rng = np.random.default_rng(20260731)
        image = rng.integers(0, 256, size=(512, 512, 3), dtype=np.uint8)
        bits = [int(bit) for bit in f"{int(SVD_EXPECTED_HEX, 16):064b}"]
        encoded = embed_dwt_dct_svd(image, bits)

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "svd-marked.png"
            self.assertTrue(cv2.imwrite(str(path), encoded))
            result = detect(request(path, "dwtDctSvd", SVD_EXPECTED_HEX))

        self.assertEqual(result["outcome"], "possibly_present")
        self.assertTrue(result["payloadMatched"])
        self.assertEqual(result["diagnostics"]["matchedBits"], 64)

    def test_decodes_the_registered_rivagan_payload(self) -> None:
        rng = np.random.default_rng(3)
        low_frequency_source = rng.integers(0, 256, size=(8, 8, 3), dtype=np.uint8)
        image = cv2.resize(low_frequency_source, (512, 512), interpolation=cv2.INTER_CUBIC)
        bits = [int(bit) for bit in f"{int(RIVAGAN_EXPECTED_HEX, 16):032b}"]
        encoded = RivaGanEncoder().encode(image, bits)

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "rivagan-marked.png"
            self.assertTrue(cv2.imwrite(str(path), encoded))
            result = detect(request(path, "rivaGan", RIVAGAN_EXPECTED_HEX))

        self.assertEqual(result["outcome"], "possibly_present")
        self.assertGreaterEqual(result["diagnostics"]["matchedBits"], 29)

    def test_rejects_images_below_the_supported_dimensions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "small.png"
            self.assertTrue(cv2.imwrite(str(path), np.zeros((64, 64, 3), dtype=np.uint8)))
            result = detect(request(path))

        self.assertEqual(result["outcome"], "unsupported_format")
        self.assertEqual(result["diagnostics"]["reason"], "dimensions")

    def test_does_not_promote_a_random_image_from_the_low_diagnostic_band(self) -> None:
        rng = np.random.default_rng(20260729)
        image = rng.integers(0, 256, size=(512, 512, 3), dtype=np.uint8)

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "unmarked.png"
            self.assertTrue(cv2.imwrite(str(path), image))
            result = detect(request(path))

        self.assertEqual(result["outcome"], "not_detected")
        self.assertGreaterEqual(result["diagnostics"]["matchedBits"], 1)
        self.assertEqual(result["threshold"], 36 / 48)

    def test_json_process_contract_decodes_the_reference_payload(self) -> None:
        rng = np.random.default_rng(20260730)
        image = rng.integers(0, 256, size=(512, 512, 3), dtype=np.uint8)
        bits = [int(bit) for bit in f"{int(EXPECTED_HEX, 16):048b}"]
        encoded = embed_dwt_dct(image, bits)

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "process-marked.png"
            self.assertTrue(cv2.imwrite(str(path), encoded))
            completed = subprocess.run(
                [sys.executable, "-m", "watermark_classic_worker"],
                input=json.dumps(request(path)),
                capture_output=True,
                check=True,
                text=True,
                timeout=5,
            )
            result = json.loads(completed.stdout)

        self.assertEqual(result["protocolVersion"], PROTOCOL_VERSION)
        self.assertEqual(result["outcome"], "possibly_present")
        self.assertEqual(result["payload"], EXPECTED_HEX)
        self.assertTrue(result["payloadMatched"])


if __name__ == "__main__":
    unittest.main()
