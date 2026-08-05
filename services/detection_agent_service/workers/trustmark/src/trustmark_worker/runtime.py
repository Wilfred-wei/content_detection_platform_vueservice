from __future__ import annotations

import contextlib
import hashlib
import io
import json
import pathlib
import re
import sys
from collections import Counter
from dataclasses import dataclass
from typing import Any, Callable

import torch
from PIL import Image, ImageOps
from trustmark import TrustMark

from trustmark_worker.provision import MANIFEST_PATH, MODEL_DIR, _digests


PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[2]
PAYLOAD_REGISTRY_PATH = PROJECT_ROOT / "resources" / "registered-payloads.v1.json"
MODEL_VARIANTS = {"P", "Q"}
VIEW_ROTATIONS = {0, 90, 180, 270}


class ArtifactUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class DecodeAttempt:
    model: str
    rotation: int
    present: bool
    secret_sha256: str | None
    schema: int


def _artifacts_by_filename() -> dict[str, dict[str, Any]]:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return {item["filename"]: item for item in manifest["models"]}


class OfflineTrustMark(TrustMark):
    def __init__(self, model_type: str):
        self._artifact_manifest = _artifacts_by_filename()
        with contextlib.redirect_stdout(sys.stderr):
            super().__init__(
                use_ECC=True,
                verbose=False,
                device="cpu",
                model_type=model_type,
                loadRemover=False,
                loadBBoxDetector=False,
            )
        if self.decoder is None:
            raise ArtifactUnavailable(f"MODEL_LOAD_FAILED:{model_type}")

    def check_and_download(self, filename: str) -> None:
        path = pathlib.Path(filename)
        artifact = self._artifact_manifest.get(path.name)
        if artifact is None or not path.is_file():
            raise ArtifactUnavailable(f"MODEL_ARTIFACT_MISSING:{path.name}")
        size, sha256, md5 = _digests(path)
        if size != artifact["sizeBytes"] or sha256 != artifact["sha256"] or md5 != artifact["md5"]:
            raise ArtifactUnavailable(f"MODEL_ARTIFACT_DIGEST:{path.name}")

    def load_model(self, config_path: str, weight_path: str, device: str, secret_len: int, part: str = "all"):
        if part != "decoder":
            return None
        config = MODEL_DIR / pathlib.Path(config_path).name
        weight = MODEL_DIR / pathlib.Path(weight_path).name
        return super().load_model(str(config), str(weight), device, secret_len, part=part)


def load_payload_registry() -> dict[str, Any]:
    registry = json.loads(PAYLOAD_REGISTRY_PATH.read_text(encoding="utf-8"))
    if registry.get("schemaVersion") != "1.0.0" or not isinstance(registry.get("bindings"), list):
        raise RuntimeError("INVALID_PAYLOAD_REGISTRY")
    binding_ids: set[str] = set()
    binding_keys: set[tuple[str, int]] = set()
    for binding in registry["bindings"]:
        if (
            not isinstance(binding.get("id"), str)
            or not binding["id"]
            or not re.fullmatch(r"[a-f0-9]{64}", binding.get("secretSha256", ""))
            or binding.get("claim") not in {"ai_generated", "test_fixture"}
            or not isinstance(binding.get("schemas"), list)
            or not binding["schemas"]
            or any(not isinstance(schema, int) or isinstance(schema, bool) or schema < 0 for schema in binding["schemas"])
        ):
            raise RuntimeError("INVALID_PAYLOAD_REGISTRY")
        keys = {(binding["secretSha256"], schema) for schema in binding["schemas"]}
        if binding["id"] in binding_ids or len(keys) != len(binding["schemas"]) or keys & binding_keys:
            raise RuntimeError("INVALID_PAYLOAD_REGISTRY")
        binding_ids.add(binding["id"])
        binding_keys.update(keys)
    return registry


def evaluate_attempts(
    attempts: list[DecodeAttempt],
    payload_registry: dict[str, Any],
    calibration_approved: bool,
    minimum_consistent_views: int,
) -> dict[str, Any]:
    detected = [attempt for attempt in attempts if attempt.present and attempt.secret_sha256]
    counts = Counter(attempt.secret_sha256 for attempt in detected)
    dominant_hash, dominant_count = counts.most_common(1)[0] if counts else (None, 0)
    bindings = {
        (binding["secretSha256"], schema): binding
        for binding in payload_registry["bindings"]
        for schema in binding["schemas"]
    }
    matched_binding = next(
        (
            bindings[(attempt.secret_sha256, attempt.schema)]
            for attempt in detected
            if (attempt.secret_sha256, attempt.schema) in bindings
            and attempt.secret_sha256 == dominant_hash
        ),
        None,
    )
    conflict = len(counts) > 1
    candidate = bool(matched_binding and dominant_count >= minimum_consistent_views)
    verified = bool(
        calibration_approved
        and candidate
        and matched_binding["claim"] == "ai_generated"
        and not conflict
    )
    outcome = "verified_present" if verified else "possibly_present" if candidate else "not_detected"
    return {
        "outcome": outcome,
        "payloadMatched": candidate,
        "payload": f"sha256:{dominant_hash}" if candidate and dominant_hash else None,
        "bindingId": matched_binding["id"] if matched_binding else None,
        "bindingClaim": matched_binding["claim"] if matched_binding else None,
        "consistentViews": dominant_count,
        "payloadConflict": conflict,
    }


def _rotated(image: Image.Image, angle: int) -> Image.Image:
    if angle == 0:
        return image
    transpose = {
        90: Image.Transpose.ROTATE_90,
        180: Image.Transpose.ROTATE_180,
        270: Image.Transpose.ROTATE_270,
    }
    return image.transpose(transpose[angle])


def decode_image(
    image: Image.Image,
    models: list[str],
    rotations: list[int],
    decoder_factory: Callable[[str], Any] = OfflineTrustMark,
) -> list[DecodeAttempt]:
    attempts: list[DecodeAttempt] = []
    for model in models:
        decoder = decoder_factory(model)
        for rotation in rotations:
            secret, present, schema = decoder.decode(_rotated(image, rotation), MODE="text", ROTATION=False)
            secret_hash = hashlib.sha256(str(secret).encode("utf-8")).hexdigest() if present else None
            attempts.append(DecodeAttempt(model, rotation, bool(present), secret_hash, int(schema)))
    return attempts


def parse_csv_setting(settings: dict[str, Any], field: str, allowed: set[Any], cast: Callable[[str], Any]) -> list[Any]:
    value = settings.get(field)
    if not isinstance(value, str) or not value:
        raise ValueError(f"INVALID_PROFILE:{field}")
    parsed = [cast(item.strip()) for item in value.split(",")]
    if len(parsed) != len(set(parsed)) or any(item not in allowed for item in parsed):
        raise ValueError(f"INVALID_PROFILE:{field}")
    return parsed


def open_bounded_image(path: pathlib.Path, maximum_pixels: int) -> Image.Image:
    Image.MAX_IMAGE_PIXELS = maximum_pixels
    with Image.open(path) as source:
        width, height = source.size
        if width < 1 or height < 1 or width * height > maximum_pixels:
            raise ValueError("IMAGE_DIMENSIONS")
        image = ImageOps.exif_transpose(source)
        image.load()
        return image.convert("RGB")


def attempts_json(attempts: list[DecodeAttempt]) -> str:
    return json.dumps(
        [
            {
                "model": attempt.model,
                "rotation": attempt.rotation,
                "present": attempt.present,
                "secretSha256": attempt.secret_sha256,
                "schema": attempt.schema,
            }
            for attempt in attempts
        ],
        separators=(",", ":"),
    )


def configure_torch(maximum_threads: int) -> None:
    torch.set_num_threads(maximum_threads)
    torch.set_num_interop_threads(1)
