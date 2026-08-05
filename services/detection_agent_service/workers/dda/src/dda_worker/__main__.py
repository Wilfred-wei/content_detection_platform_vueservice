from __future__ import annotations

import argparse
import contextlib
import hashlib
import io
import json
import sys
import time
from pathlib import Path
from typing import Any

PROTOCOL_VERSION = "model-detector.v1"
DETECTOR_ID = "dda-dinov2-lora"
PREPROCESSING_ID = "resize-336-clip-normalize-v1"
CLIP_MEAN = (0.48145466, 0.4578275, 0.40821073)
CLIP_STD = (0.26862954, 0.26130258, 0.27577711)
SUPPORTED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}
MAX_BATCH_SIZE = 32


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--checkpoint-sha256", required=True)
    parser.add_argument("--dinov2-hub-dir", required=True)
    parser.add_argument("--device", default="cuda:0")
    parser.add_argument("--detector-version", default="DDA-official-neurips2025")
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def emit(value: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(value, ensure_ascii=True, separators=(",", ":")) + "\n")
    sys.stdout.flush()


class DdaRuntime:
    def __init__(self, args: argparse.Namespace) -> None:
        source_dir = Path(args.source_dir).resolve()
        training_dir = source_dir / "Training"
        checkpoint = Path(args.checkpoint).resolve()
        hub_dir = Path(args.dinov2_hub_dir).resolve()
        if not (training_dir / "models" / "dinov2_models_lora.py").is_file():
            raise RuntimeError("DDA_SOURCE_INVALID")
        if not (hub_dir / "hubconf.py").is_file():
            raise RuntimeError("DDA_DINOV2_HUB_INVALID")
        if not checkpoint.is_file():
            raise RuntimeError("DDA_CHECKPOINT_MISSING")
        actual_checkpoint_sha256 = sha256_file(checkpoint)
        if actual_checkpoint_sha256.lower() != args.checkpoint_sha256.lower():
            raise RuntimeError("DDA_CHECKPOINT_DIGEST_MISMATCH")

        sys.path.insert(0, str(training_dir))
        import torch
        from PIL import Image
        from torchvision import transforms
        from models.dinov2_models_lora import DINOv2ModelWithLoRA

        if args.device.startswith("cuda") and not torch.cuda.is_available():
            raise RuntimeError("DDA_CUDA_UNAVAILABLE")
        self.torch = torch
        self.Image = Image
        self.device = torch.device(args.device)
        if not args.detector_version or len(args.detector_version) > 240:
            raise RuntimeError("DDA_DETECTOR_VERSION_INVALID")
        self.detector_version = args.detector_version
        self.checkpoint_sha256 = actual_checkpoint_sha256
        self.transform = transforms.Compose(
            [
                transforms.Resize((336, 336)),
                transforms.ToTensor(),
                transforms.Normalize(mean=CLIP_MEAN, std=CLIP_STD),
            ]
        )

        original_hub_load = torch.hub.load

        def load_pinned_hub(_repo_or_dir: str, model: str, *load_args: Any, **load_kwargs: Any) -> Any:
            load_kwargs["source"] = "local"
            return original_hub_load(str(hub_dir), model, *load_args, **load_kwargs)

        torch.hub.load = load_pinned_hub
        try:
            with contextlib.redirect_stdout(sys.stderr):
                model = DINOv2ModelWithLoRA("dinov2_vitl14", lora_rank=8, lora_alpha=1.0)
        finally:
            torch.hub.load = original_hub_load

        payload = torch.load(checkpoint, map_location="cpu", weights_only=False)
        state = payload.get("model", payload)
        if state and all(key.startswith("module.") for key in state):
            state = {key.removeprefix("module."): value for key, value in state.items()}
        missing, unexpected = model.load_state_dict(state, strict=False)
        if missing or unexpected:
            raise RuntimeError(
                f"DDA_CHECKPOINT_INCOMPATIBLE:missing={len(missing)}:unexpected={len(unexpected)}"
            )
        self.model = model.to(self.device).eval()
        self.total_steps = payload.get("total_steps")
        self.device_name = (
            torch.cuda.get_device_name(self.device)
            if self.device.type == "cuda"
            else "cpu"
        )

    def infer(self, request: dict[str, Any]) -> dict[str, Any]:
        request_id = request.get("requestId")
        base = {
            "protocolVersion": PROTOCOL_VERSION,
            "requestId": request_id,
            "detectorId": DETECTOR_ID,
            "detectorVersion": self.detector_version,
            "preprocessingId": PREPROCESSING_ID,
            "checkpointSha256": self.checkpoint_sha256,
            "calibrationStatus": "official_threshold_unverified_for_deployment",
        }
        if request.get("protocolVersion") != PROTOCOL_VERSION or not isinstance(request_id, str):
            raise ValueError("DDA_INVALID_REQUEST")
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
            raise ValueError("DDA_IMAGE_MISSING")
        if sha256_file(image_path) != request.get("assetSha256"):
            raise ValueError("DDA_ASSET_DIGEST_MISMATCH")

        started = time.perf_counter()
        with self.Image.open(image_path) as image:
            tensor = self.transform(image.convert("RGB")).unsqueeze(0).to(self.device)
        with self.torch.inference_mode():
            logit = float(self.model(tensor).flatten()[0].float().item())
            score = float(self.torch.sigmoid(self.torch.tensor(logit)).item())
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
                "rawLogit": logit,
                "device": str(self.device),
                "deviceName": self.device_name,
                "totalSteps": self.total_steps,
                "thresholdSource": "official_evaluation_default",
            },
        }

    def infer_batch(self, request: dict[str, Any]) -> list[dict[str, Any]]:
        if request.get("protocolVersion") != PROTOCOL_VERSION:
            raise ValueError("DDA_INVALID_BATCH_REQUEST")
        requests = request.get("requests")
        if not isinstance(requests, list) or not requests or len(requests) > MAX_BATCH_SIZE:
            raise ValueError("DDA_INVALID_BATCH_SIZE")

        started = time.perf_counter()
        prepared: list[tuple[int, dict[str, Any], Any]] = []
        outputs: list[dict[str, Any] | None] = [None] * len(requests)
        for index, child in enumerate(requests):
            if not isinstance(child, dict):
                outputs[index] = self._batch_error(None, "DDA_INVALID_REQUEST")
                continue
            request_id = child.get("requestId")
            base = self._base(request_id)
            if not isinstance(request_id, str) or child.get("protocolVersion") != PROTOCOL_VERSION:
                outputs[index] = {**base, **self._error_fields("DDA_INVALID_REQUEST")}
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
                    raise ValueError("DDA_IMAGE_MISSING")
                if sha256_file(image_path) != child.get("assetSha256"):
                    raise ValueError("DDA_ASSET_DIGEST_MISMATCH")
                with self.Image.open(image_path) as image:
                    tensor = self.transform(image.convert("RGB"))
                prepared.append((index, child, tensor))
            except Exception as error:
                outputs[index] = {**base, **self._error_fields(f"{type(error).__name__}:{error}")}

        if prepared:
            batch = self.torch.stack([item[2] for item in prepared]).to(self.device)
            with self.torch.inference_mode():
                logits = self.model(batch).reshape(-1).float().detach().cpu().tolist()
            if len(logits) != len(prepared):
                raise RuntimeError("DDA_BATCH_RESULT_MISMATCH")
            elapsed_ms = (time.perf_counter() - started) * 1000
            for (index, _child, _tensor), raw_logit in zip(prepared, logits):
                logit = float(raw_logit)
                score = float(self.torch.sigmoid(self.torch.tensor(logit)).item())
                predicted_class = "ai_generated" if score >= 0.5 else "non_ai"
                outputs[index] = {
                    **self._base(requests[index].get("requestId")),
                    "outcome": "detected" if predicted_class == "ai_generated" else "not_detected",
                    "score": score,
                    "threshold": 0.5,
                    "predictedClass": predicted_class,
                    "latencyMs": elapsed_ms,
                    "diagnostics": {
                        "rawLogit": logit,
                        "device": str(self.device),
                        "deviceName": self.device_name,
                        "totalSteps": self.total_steps,
                        "thresholdSource": "official_evaluation_default",
                        "batchSize": len(requests),
                    },
                }
        return [output if output is not None else self._batch_error(None, "DDA_BATCH_RESULT_MISSING") for output in outputs]

    def _base(self, request_id: Any) -> dict[str, Any]:
        return {
            "protocolVersion": PROTOCOL_VERSION,
            "requestId": request_id,
            "detectorId": DETECTOR_ID,
            "detectorVersion": self.detector_version,
            "preprocessingId": PREPROCESSING_ID,
            "checkpointSha256": self.checkpoint_sha256,
            "calibrationStatus": "official_threshold_unverified_for_deployment",
        }

    def _error_fields(self, reason: str) -> dict[str, Any]:
        return {
            "outcome": "error",
            "score": None,
            "threshold": 0.5,
            "predictedClass": None,
            "latencyMs": 0,
            "diagnostics": {"reason": reason},
        }

    def _batch_error(self, request_id: Any, reason: str) -> dict[str, Any]:
        return {**self._base(request_id), **self._error_fields(reason)}


def main() -> None:
    args = parse_args()
    try:
        runtime = DdaRuntime(args)
    except Exception as error:
        print(f"DDA_WORKER_INITIALIZATION_FAILED:{type(error).__name__}:{error}", file=sys.stderr, flush=True)
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
                    "calibrationStatus": "official_threshold_unverified_for_deployment",
                    "diagnostics": {"reason": f"{type(error).__name__}:{error}"},
                }
            )


if __name__ == "__main__":
    main()
