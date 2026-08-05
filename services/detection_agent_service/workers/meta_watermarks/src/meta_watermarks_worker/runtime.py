from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import sys
from dataclasses import dataclass
from typing import Any


PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[2]
MODEL_DIR = PROJECT_ROOT / "models"
VENDOR_DIR = PROJECT_ROOT / "vendor"
MANIFEST_PATH = PROJECT_ROOT / "resources" / "model-artifacts.v1.json"
PAYLOAD_REGISTRY_PATH = PROJECT_ROOT / "resources" / "registered-payloads.v1.json"


class ArtifactUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class DecodeObservation:
    detection_score: float
    bits: tuple[int, ...]
    mask_coverage: float | None = None
    mask_mean: float | None = None


def load_json(path: pathlib.Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ArtifactUnavailable(f"invalid_json:{path.name}")
    return value


def artifact_manifest() -> dict[str, Any]:
    manifest = load_json(MANIFEST_PATH)
    if manifest.get("schemaVersion") != "1.0.0" or not isinstance(manifest.get("models"), list):
        raise ArtifactUnavailable("invalid_artifact_manifest")
    return manifest


def model_artifact(profile_id: str) -> dict[str, Any]:
    for artifact in artifact_manifest()["models"]:
        if artifact.get("profileId") == profile_id:
            return artifact
    raise ArtifactUnavailable(f"unknown_profile:{profile_id}")


def file_sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verified_model_path(profile_id: str) -> pathlib.Path:
    artifact = model_artifact(profile_id)
    path = MODEL_DIR / str(artifact["filename"])
    if not path.is_file() or path.stat().st_size != artifact.get("sizeBytes"):
        raise ArtifactUnavailable(f"model_missing:{profile_id}")
    expected = artifact.get("sha256")
    if not isinstance(expected, str) or len(expected) != 64 or file_sha256(path) != expected:
        raise ArtifactUnavailable(f"model_digest_mismatch:{profile_id}")
    return path


def configure_runtime(maximum_threads: int, device_name: str):
    os.environ["OMP_NUM_THREADS"] = str(maximum_threads)
    os.environ["MKL_NUM_THREADS"] = str(maximum_threads)
    import torch

    torch.set_num_threads(maximum_threads)
    if device_name == "cpu":
        return torch.device("cpu")
    if not device_name.startswith("cuda") or not torch.cuda.is_available():
        raise ArtifactUnavailable(f"device_unavailable:{device_name}")
    device = torch.device(device_name)
    torch.cuda.set_device(device)
    return device


def _image_tensor(image_path: pathlib.Path, normalized: bool = False):
    from PIL import Image
    from torchvision.transforms.functional import pil_to_tensor

    with Image.open(image_path) as source:
        source.load()
        image = source.convert("RGB")
    tensor = pil_to_tensor(image).float().div(255).unsqueeze(0)
    if normalized:
        import torch

        mean = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)
        std = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)
        tensor = (tensor - mean) / std
    return tensor


def _aggregate_bits(bit_logits):
    if bit_logits.ndim > 2:
        dimensions = tuple(range(2, bit_logits.ndim))
        bit_logits = bit_logits.mean(dim=dimensions)
    return tuple(int(value) for value in (bit_logits[0] > 0).to("cpu").tolist())


def _verified_source(name: str) -> pathlib.Path:
    source = VENDOR_DIR / name
    receipt_path = source / ".source.json"
    source_manifest = artifact_manifest().get("sources", {}).get(name)
    if not source.is_dir() or not receipt_path.is_file() or not isinstance(source_manifest, dict):
        raise ArtifactUnavailable(f"source_missing:{name}")
    receipt = load_json(receipt_path)
    if receipt.get("commit") != source_manifest.get("commit") or receipt.get("sha256") != source_manifest.get("sha256"):
        raise ArtifactUnavailable(f"source_revision_mismatch:{name}")
    return source


def _load_extractor_from_checkpoint(source: pathlib.Path, checkpoint_path: pathlib.Path, device):
    import torch
    from omegaconf import OmegaConf

    source_text = str(source)
    if source_text not in sys.path:
        sys.path.insert(0, source_text)
    from videoseal.models import build_extractor

    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    args = OmegaConf.create(checkpoint["args"])
    image_size = args.img_size_proc if "img_size_proc" in args else args.img_size_extractor
    config_path = source / args.extractor_config
    extractor_config = OmegaConf.load(config_path)
    extractor_name = args.extractor_model or extractor_config.model
    extractor = build_extractor(extractor_name, extractor_config[extractor_name], image_size, args.nbits)
    state = {
        key.removeprefix("detector."): value
        for key, value in checkpoint["model"].items()
        if key.startswith("detector.")
    }
    extractor.load_state_dict(state, strict=True)
    return extractor.eval().to(device), int(image_size)


def decode_videoseal(profile_id: str, image_path: pathlib.Path, device) -> DecodeObservation:
    import torch
    import torch.nn.functional as functional

    model, image_size = _load_extractor_from_checkpoint(
        _verified_source("videoseal"), verified_model_path(profile_id), device,
    )
    image = _image_tensor(image_path).to(device)
    if image.shape[-2:] != (image_size, image_size):
        image = functional.interpolate(
            image,
            size=(image_size, image_size),
            mode="bilinear",
            align_corners=False,
            antialias=True,
        )
    with torch.inference_mode():
        predictions = model(image)
    detection = predictions[:, 0]
    score = torch.sigmoid(detection).mean().item()
    return DecodeObservation(score, _aggregate_bits(predictions[:, 1:]))


def _wam_source() -> pathlib.Path:
    return _verified_source("watermark-anything")


def decode_wam(image_path: pathlib.Path, device) -> DecodeObservation:
    import torch
    import torch.nn.functional as functional
    from omegaconf import OmegaConf

    source = _wam_source()
    source_text = str(source)
    if source_text not in sys.path:
        sys.path.insert(0, source_text)

    from watermark_anything.models import build_extractor

    params = load_json(source / "checkpoints" / "params.json")
    args = argparse.Namespace(**params)
    extractor_config = OmegaConf.load(source / args.extractor_config)
    extractor = build_extractor(extractor_config.model, extractor_config[args.extractor_model], args.img_size, args.nbits)
    checkpoint = torch.load(verified_model_path("wam-mit"), map_location="cpu", weights_only=True)
    state = {
        key.removeprefix("detector."): value
        for key, value in checkpoint.items()
        if key.startswith("detector.")
    }
    extractor.load_state_dict(state, strict=True)
    extractor.eval().to(device)
    image = _image_tensor(image_path, normalized=True).to(device)
    if image.shape[-2:] != (args.img_size, args.img_size):
        image = functional.interpolate(image, size=(args.img_size, args.img_size), mode="bilinear", align_corners=False)
    with torch.inference_mode():
        predictions = extractor(image)
    mask = torch.sigmoid(predictions[:, 0:1])
    selected = mask > 0.5
    coverage = selected.float().mean().item()
    if selected.any():
        expanded = selected.expand_as(predictions[:, 1:])
        bit_logits = predictions[:, 1:].masked_select(expanded).view(1, args.nbits, -1).mean(dim=2)
        bits = tuple(int(value) for value in (bit_logits[0] > 0.5).to("cpu").tolist())
    else:
        bits = tuple()
    return DecodeObservation(mask.max().item(), bits, coverage, mask.mean().item())


def decode_profile(profile_id: str, image_path: pathlib.Path, device) -> DecodeObservation:
    if profile_id in {"videoseal-v1", "pixelseal", "chunkyseal"}:
        return decode_videoseal(profile_id, image_path, device)
    if profile_id == "wam-mit":
        return decode_wam(image_path, device)
    raise ArtifactUnavailable(f"unknown_profile:{profile_id}")


def payload_registry() -> dict[str, Any]:
    registry = load_json(PAYLOAD_REGISTRY_PATH)
    if registry.get("schemaVersion") != "1.0.0" or not isinstance(registry.get("bindings"), list):
        raise ArtifactUnavailable("invalid_payload_registry")
    return registry


def payload_digest(bits: tuple[int, ...]) -> str | None:
    if not bits:
        return None
    return hashlib.sha256("".join(str(bit) for bit in bits).encode("ascii")).hexdigest()


def expected_bit_string(binding: dict[str, Any], width: int) -> str | None:
    literal = binding.get("expectedBits")
    if isinstance(literal, str) and len(literal) == width and set(literal) <= {"0", "1"}:
        return literal
    hexadecimal = binding.get("expectedBitsHex")
    if (
        isinstance(hexadecimal, str)
        and width % 4 == 0
        and len(hexadecimal) == width // 4
        and set(hexadecimal.lower()) <= set("0123456789abcdef")
    ):
        return format(int(hexadecimal, 16), f"0{width}b")
    repeated_byte = binding.get("expectedBitsByteHex")
    repetitions = binding.get("repeatCount")
    if (
        isinstance(repeated_byte, str)
        and len(repeated_byte) == 2
        and set(repeated_byte.lower()) <= set("0123456789abcdef")
        and isinstance(repetitions, int)
        and repetitions > 0
        and repetitions * 8 == width
    ):
        return format(int(repeated_byte, 16), "08b") * repetitions
    return None


def evaluate_observation(
    profile_id: str,
    observation: DecodeObservation,
    candidate_threshold: float,
    calibration_approved: bool,
    registry: dict[str, Any] | None = None,
) -> dict[str, Any]:
    expected_bits = int(model_artifact(profile_id)["payloadBits"])
    if len(observation.bits) not in {0, expected_bits}:
        raise RuntimeError(f"INVALID_DECODER_OUTPUT:payload_width:{len(observation.bits)}")
    decoded_bit_string = "".join(str(bit) for bit in observation.bits)
    digest = payload_digest(observation.bits)
    registry = registry or payload_registry()
    binding = None
    matching_bits = None
    minimum_matching_bits = None
    for candidate in registry["bindings"]:
        if candidate.get("profileId") != profile_id:
            continue
        expected = expected_bit_string(candidate, expected_bits)
        minimum = candidate.get("minimumMatchingBits")
        if expected is not None and isinstance(minimum, int):
            matches = sum(left == right for left, right in zip(decoded_bit_string, expected))
            if matches >= minimum and (matching_bits is None or matches > matching_bits):
                binding = candidate
                matching_bits = matches
                minimum_matching_bits = minimum
        elif candidate.get("payloadSha256") == digest:
            binding = candidate
            matching_bits = expected_bits
            minimum_matching_bits = expected_bits
            break
    matched = binding is not None
    # The official detector's leading channel is not a calibrated universal presence score.
    # Until a per-profile calibration exists, only an exact registered payload is a candidate.
    detected = matched
    verified = detected and calibration_approved and binding.get("claim") == "ai_generated"
    return {
        "outcome": "verified_present" if verified else "possibly_present" if detected else "not_detected",
        "score": round((matching_bits or 0) / expected_bits, 8),
        "threshold": round((minimum_matching_bits or expected_bits) / expected_bits, 8),
        "payloadMatched": matched if detected else False,
        "payload": f"sha256:{digest}" if detected and digest else None,
        "bindingId": binding.get("id") if binding else None,
        "bindingClaim": binding.get("claim") if binding else None,
        "payloadBits": len(observation.bits),
        "matchingBits": matching_bits,
        "minimumMatchingBits": minimum_matching_bits,
        "maskCoverage": observation.mask_coverage,
        "maskMean": observation.mask_mean,
        "rawDetectionScore": round(observation.detection_score, 8),
        "configuredCandidateThreshold": candidate_threshold,
        "calibrationApproved": calibration_approved,
    }
