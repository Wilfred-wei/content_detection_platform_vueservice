from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from trustmark_worker.__main__ import PROTOCOL_VERSION, detect
from trustmark_worker.provision import FIXTURE_DIR, MODEL_DIR
from trustmark_worker.runtime import (
    DecodeAttempt,
    decode_image,
    evaluate_attempts,
    load_payload_registry,
    open_bounded_image,
)


class FakeDecoder:
    def __init__(self, model: str, secret: str = "mysecret", present: bool = True, schema: int = 1):
        self.model = model
        self.secret = secret
        self.present = present
        self.schema = schema

    def decode(self, _image, MODE="text", ROTATION=False):
        return self.secret, self.present, self.schema


def request(path: Path) -> dict:
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "schemeId": "adobe-trustmark",
        "adapterId": "trustmark-pq-v1",
        "profileId": "trustmark-pq-rotations-v1",
        "imagePath": str(path),
        "mimeType": "image/png",
        "sizeBytes": path.stat().st_size,
        "settings": {
            "models": "P,Q",
            "rotations": "0,90,180,270",
            "minimumConsistentViews": 2,
            "calibrationApproved": False,
            "maxBytes": 10 * 1024 * 1024,
            "maxPixels": 40_000_000,
            "minDimension": 64,
            "maxCpuThreads": 2,
        },
        "artifacts": [],
    }


class WorkerTest(unittest.TestCase):
    def test_registered_fixture_payload_remains_supporting_before_calibration(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "image.png"
            Image.new("RGB", (240, 240), "white").save(path)
            result = detect(request(path), decoder_factory=FakeDecoder)

        self.assertEqual(result["outcome"], "possibly_present")
        self.assertTrue(result["payloadMatched"])
        self.assertEqual(result["attemptedViews"], 8)
        self.assertEqual(result["diagnostics"]["bindingClaim"], "test_fixture")
        self.assertFalse(result["diagnostics"]["calibrationApproved"])
        attempts = json.loads(result["diagnostics"]["attempts"])
        self.assertEqual(len(attempts), 8)
        self.assertTrue(all(item["secretSha256"] for item in attempts))

    def test_unregistered_payload_is_diagnostic_only(self) -> None:
        secret_hash = hashlib.sha256(b"unregistered").hexdigest()
        attempts = [DecodeAttempt("P", 0, True, secret_hash, 1)]
        result = evaluate_attempts(attempts, load_payload_registry(), True, 1)

        self.assertEqual(result["outcome"], "not_detected")
        self.assertFalse(result["payloadMatched"])
        self.assertIsNone(result["payload"])

    def test_registered_payload_below_multi_view_gate_is_neutral(self) -> None:
        registry = {
            "bindings": [{
                "id": "owned-ai-payload",
                "secretSha256": "a" * 64,
                "schemas": [1],
                "claim": "ai_generated",
            }],
        }
        attempts = [DecodeAttempt("P", 0, True, "a" * 64, 1)]
        result = evaluate_attempts(attempts, registry, True, 2)

        self.assertEqual(result["outcome"], "not_detected")
        self.assertFalse(result["payloadMatched"])

    def test_conflicting_payloads_cannot_be_verified(self) -> None:
        registry = {
            "bindings": [{
                "id": "owned-ai-payload",
                "secretSha256": "a" * 64,
                "schemas": [1],
                "claim": "ai_generated",
            }],
        }
        attempts = [
            DecodeAttempt("P", 0, True, "a" * 64, 1),
            DecodeAttempt("Q", 0, True, "b" * 64, 1),
        ]
        result = evaluate_attempts(attempts, registry, True, 1)

        self.assertEqual(result["outcome"], "possibly_present")
        self.assertTrue(result["payloadConflict"])

    def test_small_image_is_rejected_before_model_loading(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "small.png"
            Image.new("RGB", (32, 32), "black").save(path)
            result = detect(request(path), decoder_factory=lambda _model: self.fail("decoder should not load"))

        self.assertEqual(result["outcome"], "unsupported_format")
        self.assertEqual(result["diagnostics"]["reason"], "dimensions")

    def test_worker_rejects_profiles_that_exceed_the_cpu_thread_cap(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "image.png"
            Image.new("RGB", (240, 240), "white").save(path)
            payload = request(path)
            payload["settings"]["maxCpuThreads"] = 9
            with self.assertRaisesRegex(ValueError, "INVALID_PROFILE:maxCpuThreads"):
                detect(payload, decoder_factory=lambda _model: self.fail("decoder should not load"))

    @unittest.skipUnless(
        all((MODEL_DIR / filename).is_file() for filename in ("decoder_P.ckpt", "decoder_Q.ckpt"))
        and all((FIXTURE_DIR / filename).is_file() for filename in ("ufo_240_P.png", "ufo_240_Q.png")),
        "pinned TrustMark models and official fixtures are not provisioned",
    )
    def test_official_p_and_q_fixtures_decode_to_the_registered_test_payload(self) -> None:
        expected_hashes = {
            "P": "b6ba4977124ce79529b82bf9ce751f415e43f1f0ea492176bb6648d500666ec5",
            "Q": hashlib.sha256(b"mysecret").hexdigest(),
        }
        for model in ("P", "Q"):
            with self.subTest(model=model):
                image = open_bounded_image(FIXTURE_DIR / f"ufo_240_{model}.png", 40_000_000)
                attempts = decode_image(image, [model], [0])
                self.assertEqual(len(attempts), 1)
                self.assertTrue(attempts[0].present)
                self.assertEqual(attempts[0].secret_sha256, expected_hashes[model])
                self.assertEqual(attempts[0].schema, 1)


if __name__ == "__main__":
    unittest.main()
