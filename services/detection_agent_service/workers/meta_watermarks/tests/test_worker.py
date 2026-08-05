from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from meta_watermarks_worker.__main__ import ADAPTER_ID, PROTOCOL_VERSION, detect
from meta_watermarks_worker.runtime import DecodeObservation, evaluate_observation


def request(path: Path, profile_id: str = "videoseal-v1") -> dict:
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "schemeId": f"meta-{profile_id}",
        "adapterId": ADAPTER_ID,
        "profileId": profile_id,
        "imagePath": str(path),
        "mimeType": "image/png",
        "sizeBytes": path.stat().st_size,
        "settings": {
            "candidateDetectionThreshold": 0.5,
            "calibrationApproved": False,
            "device": "cuda:0",
            "maxBytes": 10 * 1024 * 1024,
            "maxPixels": 40_000_000,
            "minDimension": 64,
            "maxCpuThreads": 2,
        },
        "artifacts": [],
    }


class MetaWatermarksWorkerTest(unittest.TestCase):
    def test_registered_candidate_is_supporting_before_calibration(self) -> None:
        bits = tuple([1, 0] * 128)
        payload_hash = hashlib.sha256(("10" * 128).encode("ascii")).hexdigest()
        registry = {"schemaVersion": "1.0.0", "bindings": [{
            "id": "owned-payload",
            "profileId": "videoseal-v1",
            "payloadSha256": payload_hash,
            "expectedBits": "10" * 128,
            "minimumMatchingBits": 200,
            "claim": "ai_generated",
        }]}
        result = evaluate_observation("videoseal-v1", DecodeObservation(0.51, bits), 0.95, False, registry)

        self.assertEqual(result["outcome"], "possibly_present")
        self.assertTrue(result["payloadMatched"])
        self.assertEqual(result["score"], 1)
        self.assertEqual(result["rawDetectionScore"], 0.51)

    def test_below_threshold_is_neutral_not_detected(self) -> None:
        observation = DecodeObservation(0.2, tuple([0] * 256))
        result = evaluate_observation(
            "videoseal-v1",
            observation,
            0.5,
            False,
            {"bindings": [], "schemaVersion": "1.0.0"},
        )
        self.assertEqual(result["outcome"], "not_detected")
        self.assertIsNone(result["payload"])

    def test_registered_ai_payload_requires_calibration_for_verified_status(self) -> None:
        bits = tuple([1] * 32)
        payload_hash = hashlib.sha256(("1" * 32).encode("ascii")).hexdigest()
        registry = {
            "schemaVersion": "1.0.0",
            "bindings": [{
                "id": "owned-wam-payload",
                "profileId": "wam-mit",
                "payloadSha256": payload_hash,
                "claim": "ai_generated",
            }],
        }
        supporting = evaluate_observation("wam-mit", DecodeObservation(0.9, bits), 0.5, False, registry)
        verified = evaluate_observation("wam-mit", DecodeObservation(0.9, bits), 0.5, True, registry)
        self.assertEqual(supporting["outcome"], "possibly_present")
        self.assertTrue(supporting["payloadMatched"])
        self.assertEqual(verified["outcome"], "verified_present")

    def test_compact_repeated_byte_binding_matches_wide_payload(self) -> None:
        bits = tuple(int(value) for value in "10100101" * 128)
        registry = {
            "schemaVersion": "1.0.0",
            "bindings": [{
                "id": "owned-chunkyseal-payload",
                "profileId": "chunkyseal",
                "expectedBitsByteHex": "a5",
                "repeatCount": 128,
                "minimumMatchingBits": 900,
                "claim": "test_fixture",
            }],
        }
        result = evaluate_observation("chunkyseal", DecodeObservation(0.5, bits), 0.95, False, registry)
        self.assertEqual(result["outcome"], "possibly_present")
        self.assertEqual(result["matchingBits"], 1024)

    def test_wrong_payload_width_is_rejected(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "payload_width"):
            evaluate_observation(
                "chunkyseal",
                DecodeObservation(0.9, tuple([1] * 256)),
                0.5,
                False,
                {"bindings": [], "schemaVersion": "1.0.0"},
            )

    def test_small_image_is_rejected_before_decoder(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "small.png"
            Image.new("RGB", (32, 32), "black").save(path)
            result = detect(request(path), decoder=lambda *_args: self.fail("decoder must not run"))
        self.assertEqual(result["outcome"], "unsupported_format")
        self.assertEqual(result["diagnostics"]["reason"], "dimensions")


if __name__ == "__main__":
    unittest.main()
