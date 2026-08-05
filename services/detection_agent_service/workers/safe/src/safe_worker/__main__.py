from __future__ import annotations

import argparse
import contextlib
import hashlib
import importlib.util
import json
import sys
import time
from pathlib import Path
from typing import Any

PROTOCOL_VERSION = "model-detector.v1"
DETECTOR_ID = "safe-wavelet-resnet"
DETECTOR_VERSION_PREFIX = "SAFE-official-kdd2025"
PREPROCESSING_ID = "safe-center-crop256-totensor-v1"
CALIBRATION_STATUS = "official_threshold_unverified_for_deployment"
SUPPORTED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}
MAX_BATCH_SIZE = 32


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True)
    parser.add_argument("--source-revision", required=True)
    parser.add_argument("--source-sha256", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--checkpoint-sha256", required=True)
    parser.add_argument("--device", default="cuda:0")
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


class SafeRuntime:
    def __init__(self, args: argparse.Namespace) -> None:
        source_dir = Path(args.source_dir).resolve()
        source_file = source_dir / "models" / "resnet.py"
        checkpoint = Path(args.checkpoint).resolve()
        self.source_sha256 = require_digest(source_file, args.source_sha256, "SAFE_SOURCE")
        self.checkpoint_sha256 = require_digest(
            checkpoint, args.checkpoint_sha256, "SAFE_CHECKPOINT"
        )
        self.source_revision = args.source_revision.lower()
        if len(self.source_revision) != 40 or any(
            character not in "0123456789abcdef" for character in self.source_revision
        ):
            raise RuntimeError("SAFE_SOURCE_REVISION_INVALID")

        import torch
        from PIL import Image
        from torchvision import transforms

        if args.device.startswith("cuda") and not torch.cuda.is_available():
            raise RuntimeError("SAFE_CUDA_UNAVAILABLE")
        self.torch = torch
        self.Image = Image
        self.device = torch.device(args.device)
        self.transform = transforms.Compose(
            [transforms.CenterCrop((256, 256)), transforms.ToTensor()]
        )

        spec = importlib.util.spec_from_file_location("safe_upstream_resnet", source_file)
        if spec is None or spec.loader is None:
            raise RuntimeError("SAFE_SOURCE_IMPORT_INVALID")
        module = importlib.util.module_from_spec(spec)
        with contextlib.redirect_stdout(sys.stderr):
            spec.loader.exec_module(module)
            model = module.resnet50(num_classes=2)

        payload = torch.load(checkpoint, map_location="cpu", weights_only=True)
        state = payload.get("model", payload)
        missing, unexpected = model.load_state_dict(state, strict=False)
        if missing or unexpected:
            raise RuntimeError(
                f"SAFE_CHECKPOINT_INCOMPATIBLE:missing={len(missing)}:unexpected={len(unexpected)}"
            )
        self.model = model.to(self.device).eval()
        self.device_name = (
            torch.cuda.get_device_name(self.device)
            if self.device.type == "cuda"
            else "cpu"
        )

    @property
    def detector_version(self) -> str:
        return f"{DETECTOR_VERSION_PREFIX}-{self.source_revision[:8]}"

    def infer(self, request: dict[str, Any]) -> dict[str, Any]:
        request_id = request.get("requestId")
        base = {
            "protocolVersion": PROTOCOL_VERSION,
            "requestId": request_id,
            "detectorId": DETECTOR_ID,
            "detectorVersion": self.detector_version,
            "preprocessingId": PREPROCESSING_ID,
            "checkpointSha256": self.checkpoint_sha256,
            "calibrationStatus": CALIBRATION_STATUS,
        }
        if request.get("protocolVersion") != PROTOCOL_VERSION or not isinstance(
            request_id, str
        ):
            raise ValueError("SAFE_INVALID_REQUEST")
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
            raise ValueError("SAFE_IMAGE_MISSING")
        if sha256_file(image_path) != request.get("assetSha256"):
            raise ValueError("SAFE_ASSET_DIGEST_MISMATCH")

        started = time.perf_counter()
        with self.Image.open(image_path) as image:
            tensor = self.transform(image.convert("RGB")).unsqueeze(0).to(self.device)
        with self.torch.inference_mode():
            logits = self.model(tensor).float()
            score = float(self.torch.nn.functional.softmax(logits, dim=1)[0, 1].item())
            raw_logits = [float(value) for value in logits[0].detach().cpu().tolist()]
        latency_ms = (time.perf_counter() - started) * 1000
        predicted_class = "ai_generated" if score > 0.5 else "non_ai"
        return {
            **base,
            "outcome": "detected" if predicted_class == "ai_generated" else "not_detected",
            "score": score,
            "threshold": 0.5,
            "predictedClass": predicted_class,
            "latencyMs": latency_ms,
            "diagnostics": {
                "rawLogitReal": raw_logits[0],
                "rawLogitFake": raw_logits[1],
                "device": str(self.device),
                "deviceName": self.device_name,
                "sourceRevision": self.source_revision,
                "sourceSha256": self.source_sha256,
                "thresholdSource": "official_evaluation_strict_greater_than_0.5",
                "licenseStatus": "apache-2.0-upstream-repository",
            },
        }

    def infer_batch(self, request: dict[str, Any]) -> list[dict[str, Any]]:
        if request.get("protocolVersion") != PROTOCOL_VERSION:
            raise ValueError("SAFE_INVALID_BATCH_REQUEST")
        requests = request.get("requests")
        if not isinstance(requests, list) or not requests or len(requests) > MAX_BATCH_SIZE:
            raise ValueError("SAFE_INVALID_BATCH_SIZE")
        started = time.perf_counter()
        prepared: list[tuple[int, dict[str, Any], Any]] = []
        outputs: list[dict[str, Any] | None] = [None] * len(requests)
        for index, child in enumerate(requests):
            if not isinstance(child, dict):
                outputs[index] = self._batch_error(None, "SAFE_INVALID_REQUEST")
                continue
            request_id = child.get("requestId")
            base = self._base(request_id)
            if not isinstance(request_id, str) or child.get("protocolVersion") != PROTOCOL_VERSION:
                outputs[index] = {**base, **self._error_fields("SAFE_INVALID_REQUEST")}
                continue
            if child.get("mimeType") not in SUPPORTED_MIME_TYPES:
                outputs[index] = {
                    **base,
                    "outcome": "unsupported_format",
                    "score": None,
                    "threshold": None,
                    "predictedClass": None,
                    "latencyMs": 0,
                    "diagnostics": {"reason": "mime_type", "batchSize": len(requests)},
                }
                continue
            image_path = Path(str(child.get("imagePath", ""))).resolve()
            try:
                if not image_path.is_file():
                    raise ValueError("SAFE_IMAGE_MISSING")
                if sha256_file(image_path) != child.get("assetSha256"):
                    raise ValueError("SAFE_ASSET_DIGEST_MISMATCH")
                with self.Image.open(image_path) as image:
                    tensor = self.transform(image.convert("RGB"))
                prepared.append((index, child, tensor))
            except Exception as error:
                outputs[index] = {**base, **self._error_fields(f"{type(error).__name__}:{error}")}

        if prepared:
            batch = self.torch.stack([item[2] for item in prepared]).to(self.device)
            with self.torch.inference_mode():
                logits = self.model(batch).float()
                scores = self.torch.nn.functional.softmax(logits, dim=1)[:, 1].detach().cpu().tolist()
                raw_logits = logits.detach().cpu().tolist()
            elapsed_ms = (time.perf_counter() - started) * 1000
            for (index, _child, _tensor), score_value, raw in zip(prepared, scores, raw_logits):
                score = float(score_value)
                predicted_class = "ai_generated" if score > 0.5 else "non_ai"
                outputs[index] = {
                    **self._base(requests[index].get("requestId")),
                    "outcome": "detected" if predicted_class == "ai_generated" else "not_detected",
                    "score": score,
                    "threshold": 0.5,
                    "predictedClass": predicted_class,
                    "latencyMs": elapsed_ms,
                    "diagnostics": {
                        "rawLogitReal": float(raw[0]),
                        "rawLogitFake": float(raw[1]),
                        "device": str(self.device),
                        "deviceName": self.device_name,
                        "sourceRevision": self.source_revision,
                        "sourceSha256": self.source_sha256,
                        "thresholdSource": "official_evaluation_strict_greater_than_0.5",
                        "licenseStatus": "apache-2.0-upstream-repository",
                        "batchSize": len(requests),
                    },
                }
        return [output if output is not None else self._batch_error(None, "SAFE_BATCH_RESULT_MISSING") for output in outputs]

    def _base(self, request_id: Any) -> dict[str, Any]:
        return {
            "protocolVersion": PROTOCOL_VERSION,
            "requestId": request_id,
            "detectorId": DETECTOR_ID,
            "detectorVersion": self.detector_version,
            "preprocessingId": PREPROCESSING_ID,
            "checkpointSha256": self.checkpoint_sha256,
            "calibrationStatus": CALIBRATION_STATUS,
        }

    def _error_fields(self, reason: str) -> dict[str, Any]:
        return {
            "outcome": "error",
            "score": None,
            "threshold": 0.5,
            "predictedClass": None,
            "latencyMs": 0,
            "diagnostics": {
                "reason": reason,
                "sourceRevision": self.source_revision,
                "sourceSha256": self.source_sha256,
            },
        }

    def _batch_error(self, request_id: Any, reason: str) -> dict[str, Any]:
        return {**self._base(request_id), **self._error_fields(reason)}


def main() -> None:
    args = parse_args()
    try:
        runtime = SafeRuntime(args)
    except Exception as error:
        print(
            f"SAFE_WORKER_INITIALIZATION_FAILED:{type(error).__name__}:{error}",
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
                    "detectorVersion": runtime.detector_version,
                    "outcome": "error",
                    "score": None,
                    "threshold": 0.5,
                    "predictedClass": None,
                    "latencyMs": 0,
                    "preprocessingId": PREPROCESSING_ID,
                    "checkpointSha256": runtime.checkpoint_sha256,
                    "calibrationStatus": CALIBRATION_STATUS,
                    "diagnostics": {
                        "reason": f"{type(error).__name__}:{error}",
                        "sourceRevision": runtime.source_revision,
                        "sourceSha256": runtime.source_sha256,
                    },
                }
            )


if __name__ == "__main__":
    main()
