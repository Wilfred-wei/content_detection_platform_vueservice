from __future__ import annotations

import argparse
import contextlib
import hashlib
import io
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

PROTOCOL_VERSION = "model-detector.v1"
DETECTOR_ID = "mirror-dinov3-hplus"
DETECTOR_VERSION = "MIRROR-dinov3-hplus-18c56efa"
PREPROCESSING_ID = "mirror-short512-center224-jpeg96-v1"
CALIBRATION_STATUS = "experimental_threshold_unverified_for_deployment"
SUPPORTED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}
FORMAT_ALIGNED_SUFFIXES = {".png", ".bmp", ".tif", ".tiff"}
MAX_BATCH_SIZE = 32


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True)
    parser.add_argument("--source-revision", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--checkpoint-sha256", required=True)
    parser.add_argument("--memory-bank", required=True)
    parser.add_argument("--memory-bank-sha256", required=True)
    parser.add_argument("--backbone-dir", required=True)
    parser.add_argument("--backbone-sha256", required=True)
    parser.add_argument("--device", default="cuda:0")
    parser.add_argument("--use-amp", action="store_true")
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require_digest(path: Path, expected: str, code: str) -> str:
    if not path.is_file():
        raise RuntimeError(f"{code}_MISSING")
    actual = sha256_file(path)
    if actual.lower() != expected.lower():
        raise RuntimeError(f"{code}_DIGEST_MISMATCH")
    return actual


def emit(value: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(value, ensure_ascii=True, separators=(",", ":")) + "\n")
    sys.stdout.flush()


class MirrorRuntime:
    def __init__(self, args: argparse.Namespace) -> None:
        source_dir = Path(args.source_dir).resolve()
        checkpoint = Path(args.checkpoint).resolve()
        memory_bank = Path(args.memory_bank).resolve()
        backbone_dir = Path(args.backbone_dir).resolve()
        backbone_weights = backbone_dir / "model.safetensors"
        if not (source_dir / "models" / "mirror.py").is_file():
            raise RuntimeError("MIRROR_SOURCE_INVALID")
        try:
            revision = subprocess.run(
                ["git", "-C", str(source_dir), "rev-parse", "HEAD"],
                check=True,
                capture_output=True,
                text=True,
                timeout=10,
            ).stdout.strip()
        except Exception as error:
            raise RuntimeError("MIRROR_SOURCE_REVISION_UNAVAILABLE") from error
        if revision != args.source_revision:
            raise RuntimeError("MIRROR_SOURCE_REVISION_MISMATCH")
        if not (backbone_dir / "config.json").is_file():
            raise RuntimeError("MIRROR_BACKBONE_CONFIG_MISSING")

        self.checkpoint_sha256 = require_digest(
            checkpoint, args.checkpoint_sha256, "MIRROR_CHECKPOINT"
        )
        self.memory_bank_sha256 = require_digest(
            memory_bank, args.memory_bank_sha256, "MIRROR_MEMORY_BANK"
        )
        self.backbone_sha256 = require_digest(
            backbone_weights, args.backbone_sha256, "MIRROR_BACKBONE"
        )

        sys.path.insert(0, str(source_dir))
        import torch
        from PIL import Image
        from torchvision.transforms import functional as transform_functional
        from models.mirror import build_mirror

        if args.device.startswith("cuda") and not torch.cuda.is_available():
            raise RuntimeError("MIRROR_CUDA_UNAVAILABLE")
        self.torch = torch
        self.Image = Image
        self.transform_functional = transform_functional
        self.device = torch.device(args.device)
        self.use_amp = bool(args.use_amp and self.device.type == "cuda")

        original_torch_load = torch.load

        def safe_torch_load(*load_args: Any, **load_kwargs: Any) -> Any:
            load_kwargs["weights_only"] = True
            return original_torch_load(*load_args, **load_kwargs)

        torch.load = safe_torch_load
        try:
            with contextlib.redirect_stdout(sys.stderr):
                model = build_mirror(
                    memory_path=str(memory_bank),
                    backbone_path=str(backbone_dir),
                )
        finally:
            torch.load = original_torch_load
        # The official Phase 2 checkpoint stores its training arguments as an
        # argparse.Namespace alongside tensors. Keep weights-only loading and
        # allow only that standard-library metadata type.
        with torch.serialization.safe_globals([argparse.Namespace]):
            payload = torch.load(checkpoint, map_location="cpu", weights_only=True)
        state = payload.get("model", payload.get("state_dict", payload))
        missing, unexpected = model.load_state_dict(state, strict=False)
        if missing or unexpected:
            raise RuntimeError(
                f"MIRROR_CHECKPOINT_INCOMPATIBLE:missing={len(missing)}:unexpected={len(unexpected)}"
            )
        self.model = model.to(self.device).eval()
        self.device_name = (
            torch.cuda.get_device_name(self.device)
            if self.device.type == "cuda"
            else "cpu"
        )

    def _preprocess(self, image_path: Path) -> Any:
        with self.Image.open(image_path) as source:
            image = source.convert("RGB")
            width, height = image.size
            short = min(width, height)
            if short > 512:
                scale = 512 / short
                image = self.transform_functional.resize(
                    image,
                    [round(height * scale), round(width * scale)],
                    antialias=True,
                )
            image = self.transform_functional.center_crop(image, [224, 224])
            if image_path.suffix.lower() in FORMAT_ALIGNED_SUFFIXES:
                buffer = io.BytesIO()
                image.save(buffer, format="JPEG", quality=96, optimize=True)
                buffer.seek(0)
                image = self.Image.open(buffer).convert("RGB")
            return self.transform_functional.to_tensor(image).unsqueeze(0)

    def infer(self, request: dict[str, Any]) -> dict[str, Any]:
        request_id = request.get("requestId")
        base = {
            "protocolVersion": PROTOCOL_VERSION,
            "requestId": request_id,
            "detectorId": DETECTOR_ID,
            "detectorVersion": DETECTOR_VERSION,
            "preprocessingId": PREPROCESSING_ID,
            "checkpointSha256": self.checkpoint_sha256,
            "calibrationStatus": CALIBRATION_STATUS,
        }
        if request.get("protocolVersion") != PROTOCOL_VERSION or not isinstance(request_id, str):
            raise ValueError("MIRROR_INVALID_REQUEST")
        if request.get("mimeType") not in SUPPORTED_MIME_TYPES:
            return {
                **base,
                "outcome": "unsupported_format",
                "score": None,
                "threshold": None,
                "predictedClass": None,
                "latencyMs": 0,
                "diagnostics": {"reason": "mime_type"},
            }
        image_path = Path(str(request.get("imagePath", ""))).resolve()
        if not image_path.is_file():
            raise ValueError("MIRROR_IMAGE_MISSING")
        if sha256_file(image_path) != request.get("assetSha256"):
            raise ValueError("MIRROR_ASSET_DIGEST_MISMATCH")

        started = time.perf_counter()
        tensor = self._preprocess(image_path).to(self.device)
        with self.torch.inference_mode(), self.torch.amp.autocast(
            "cuda", enabled=self.use_amp
        ):
            logits, _, _ = self.model(tensor)
            probability = self.torch.nn.functional.softmax(logits.float(), dim=1)[0, 1]
            score = float(probability.item())
        latency_ms = (time.perf_counter() - started) * 1000
        predicted_class = "ai_generated" if score >= 0.5 else "non_ai"
        return {
            **base,
            "outcome": "detected" if predicted_class == "ai_generated" else "not_detected",
            "score": score,
            "threshold": 0.5,
            "predictedClass": predicted_class,
            "latencyMs": latency_ms,
            "diagnostics": {
                "device": str(self.device),
                "deviceName": self.device_name,
                "useAmp": self.use_amp,
                "memoryBankSha256": self.memory_bank_sha256,
                "backboneSha256": self.backbone_sha256,
                "thresholdSource": "repository_binary_probability_boundary",
                "licenseStatus": "unverified_experimental_use_only",
            },
        }

    def infer_batch(self, request: dict[str, Any]) -> list[dict[str, Any]]:
        if request.get("protocolVersion") != PROTOCOL_VERSION:
            raise ValueError("MIRROR_INVALID_BATCH_REQUEST")
        requests = request.get("requests")
        if not isinstance(requests, list) or not requests or len(requests) > MAX_BATCH_SIZE:
            raise ValueError("MIRROR_INVALID_BATCH_SIZE")
        started = time.perf_counter()
        prepared: list[tuple[int, dict[str, Any], Any]] = []
        outputs: list[dict[str, Any] | None] = [None] * len(requests)
        for index, child in enumerate(requests):
            if not isinstance(child, dict):
                outputs[index] = self._batch_error(None, "MIRROR_INVALID_REQUEST")
                continue
            request_id = child.get("requestId")
            base = self._base(request_id)
            if not isinstance(request_id, str) or child.get("protocolVersion") != PROTOCOL_VERSION:
                outputs[index] = {**base, **self._error_fields("MIRROR_INVALID_REQUEST")}
                continue
            if child.get("mimeType") not in SUPPORTED_MIME_TYPES:
                outputs[index] = {
                    **base,
                    "outcome": "unsupported_format",
                    "score": None,
                    "threshold": None,
                    "predictedClass": None,
                    "latencyMs": 0,
                    "diagnostics": self._diagnostics({"reason": "mime_type", "batchSize": len(requests)}),
                }
                continue
            image_path = Path(str(child.get("imagePath", ""))).resolve()
            try:
                if not image_path.is_file():
                    raise ValueError("MIRROR_IMAGE_MISSING")
                if sha256_file(image_path) != child.get("assetSha256"):
                    raise ValueError("MIRROR_ASSET_DIGEST_MISMATCH")
                prepared.append((index, child, self._preprocess(image_path)))
            except Exception as error:
                outputs[index] = {**base, **self._error_fields(f"{type(error).__name__}:{error}")}

        if prepared:
            batch = self.torch.cat([item[2] for item in prepared], dim=0).to(self.device)
            with self.torch.inference_mode(), self.torch.amp.autocast("cuda", enabled=self.use_amp):
                logits, _, _ = self.model(batch)
                probabilities = self.torch.nn.functional.softmax(logits.float(), dim=1)[:, 1].detach().cpu().tolist()
            elapsed_ms = (time.perf_counter() - started) * 1000
            for (index, _child, _tensor), probability in zip(prepared, probabilities):
                score = float(probability)
                predicted_class = "ai_generated" if score >= 0.5 else "non_ai"
                outputs[index] = {
                    **self._base(requests[index].get("requestId")),
                    "outcome": "detected" if predicted_class == "ai_generated" else "not_detected",
                    "score": score,
                    "threshold": 0.5,
                    "predictedClass": predicted_class,
                    "latencyMs": elapsed_ms,
                    "diagnostics": self._diagnostics({"batchSize": len(requests)}),
                }
        return [output if output is not None else self._batch_error(None, "MIRROR_BATCH_RESULT_MISSING") for output in outputs]

    def _base(self, request_id: Any) -> dict[str, Any]:
        return {
            "protocolVersion": PROTOCOL_VERSION,
            "requestId": request_id,
            "detectorId": DETECTOR_ID,
            "detectorVersion": DETECTOR_VERSION,
            "preprocessingId": PREPROCESSING_ID,
            "checkpointSha256": self.checkpoint_sha256,
            "calibrationStatus": CALIBRATION_STATUS,
        }

    def _diagnostics(self, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        return {
            "device": str(self.device),
            "deviceName": self.device_name,
            "useAmp": self.use_amp,
            "memoryBankSha256": self.memory_bank_sha256,
            "backboneSha256": self.backbone_sha256,
            "thresholdSource": "repository_binary_probability_boundary",
            "licenseStatus": "unverified_experimental_use_only",
            **(extra or {}),
        }

    def _error_fields(self, reason: str) -> dict[str, Any]:
        return {
            "outcome": "error",
            "score": None,
            "threshold": 0.5,
            "predictedClass": None,
            "latencyMs": 0,
            "diagnostics": self._diagnostics({"reason": reason}),
        }

    def _batch_error(self, request_id: Any, reason: str) -> dict[str, Any]:
        return {**self._base(request_id), **self._error_fields(reason)}


def main() -> None:
    args = parse_args()
    try:
        runtime = MirrorRuntime(args)
    except Exception as error:
        print(
            f"MIRROR_WORKER_INITIALIZATION_FAILED:{type(error).__name__}:{error}",
            file=sys.stderr,
            flush=True,
        )
        raise SystemExit(1) from error

    for line in sys.stdin:
        request_id: Any = None
        try:
            request = json.loads(line)
            if isinstance(request, dict) and "requests" in request:
                for result in runtime.infer_batch(request):
                    emit(result)
            else:
                request_id = request.get("requestId") if isinstance(request, dict) else None
                emit(runtime.infer(request))
        except Exception as error:
            emit(
                {
                    "protocolVersion": PROTOCOL_VERSION,
                    "requestId": request_id if isinstance(request_id, str) else "invalid-request",
                    "detectorId": DETECTOR_ID,
                    "detectorVersion": DETECTOR_VERSION,
                    "outcome": "error",
                    "score": None,
                    "threshold": 0.5,
                    "predictedClass": None,
                    "latencyMs": 0,
                    "preprocessingId": PREPROCESSING_ID,
                    "checkpointSha256": runtime.checkpoint_sha256,
                    "calibrationStatus": CALIBRATION_STATUS,
                    "diagnostics": {"reason": f"{type(error).__name__}:{error}"},
                }
            )


if __name__ == "__main__":
    main()
