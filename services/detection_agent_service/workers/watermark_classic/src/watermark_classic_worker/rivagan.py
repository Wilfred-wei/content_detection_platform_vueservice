from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np


PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = PROJECT_ROOT / "models"
MANIFEST_PATH = PROJECT_ROOT / "resources" / "model-artifacts.v1.json"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verified_model_path(filename: str) -> Path:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    artifact = next((item for item in manifest.get("models", []) if item.get("filename") == filename), None)
    path = MODEL_DIR / filename
    if not artifact or not path.is_file() or _sha256(path) != artifact.get("sha256"):
        raise RuntimeError(f"MODEL_UNAVAILABLE:{filename}")
    return path


def _session(model: Path, maximum_threads: int):
    import onnxruntime

    options = onnxruntime.SessionOptions()
    options.intra_op_num_threads = maximum_threads
    options.inter_op_num_threads = 1
    options.execution_mode = onnxruntime.ExecutionMode.ORT_SEQUENTIAL
    return onnxruntime.InferenceSession(str(model), sess_options=options, providers=["CPUExecutionProvider"])


class RivaGanDecoder:
    def __init__(self, bit_count: int = 32, threshold: float = 0.52, maximum_threads: int = 2):
        if bit_count != 32:
            raise ValueError("RIVAGAN_REQUIRES_32_BITS")

        self.threshold = threshold
        self.session = _session(verified_model_path("rivagan_decoder.onnx"), maximum_threads)

    def decode(self, image: np.ndarray) -> list[int]:
        frame = np.asarray([image], dtype=np.float32) / 127.5 - 1.0
        frame = np.transpose(frame, (3, 0, 1, 2))[None, ...]
        output = self.session.run(None, {"frame": frame})[0][0]
        return [int(value) for value in np.asarray(output > self.threshold, dtype=np.uint8)]


class RivaGanEncoder:
    def __init__(self, maximum_threads: int = 2):
        self.session = _session(verified_model_path("rivagan_encoder.onnx"), maximum_threads)

    def encode(self, image: np.ndarray, bits: list[int]) -> np.ndarray:
        if len(bits) != 32:
            raise ValueError("RIVAGAN_REQUIRES_32_BITS")
        frame = np.asarray([image], dtype=np.float32) / 127.5 - 1.0
        frame = np.transpose(frame, (3, 0, 1, 2))[None, ...]
        data = np.asarray([bits], dtype=np.float32)
        output = self.session.run(None, {"frame": frame, "data": data})[0]
        result = np.clip(output, -1.0, 1.0)
        return ((np.transpose(result[0, :, 0, :, :], (1, 2, 0)) + 1.0) * 127.5).astype(np.uint8)
