from __future__ import annotations

import json
import pathlib
import sys
import time
from typing import Any, Callable

from meta_watermarks_worker.runtime import (
    ArtifactUnavailable,
    DecodeObservation,
    configure_runtime,
    decode_profile,
    evaluate_observation,
)


PROTOCOL_VERSION = "1.0.0"
ADAPTER_ID = "meta-watermarks-v1"
DETECTOR_VERSION = "meta-watermarks:videoseal@870ca7fb:wam@2c08af04"
ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}


def integer_setting(settings: dict[str, Any], field: str, minimum: int, maximum: int) -> int:
    value = settings.get(field)
    if not isinstance(value, int) or isinstance(value, bool) or not minimum <= value <= maximum:
        raise ValueError(f"INVALID_PROFILE:{field}")
    return value


def number_setting(settings: dict[str, Any], field: str, minimum: float, maximum: float) -> float:
    value = settings.get(field)
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not minimum <= float(value) <= maximum:
        raise ValueError(f"INVALID_PROFILE:{field}")
    return float(value)


def response(request: dict[str, Any], started: float, **values: Any) -> dict[str, Any]:
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "schemeId": request.get("schemeId", "unknown"),
        "adapterId": request.get("adapterId", ADAPTER_ID),
        "detectorVersion": DETECTOR_VERSION,
        "profileId": request.get("profileId", "unknown"),
        "score": None,
        "threshold": None,
        "payloadMatched": None,
        "payload": None,
        "attemptedViews": 0,
        "latencyMs": round((time.monotonic() - started) * 1000, 3),
        "artifacts": request.get("artifacts", []),
        "diagnostics": {},
        **values,
    }


def detect(
    request: dict[str, Any],
    decoder: Callable[[str, pathlib.Path, Any], DecodeObservation] = decode_profile,
) -> dict[str, Any]:
    started = time.monotonic()
    if request.get("protocolVersion") != PROTOCOL_VERSION:
        raise ValueError("INVALID_REQUEST:protocolVersion")
    if request.get("adapterId") != ADAPTER_ID:
        raise ValueError("INVALID_REQUEST:adapterId")
    profile_id = request.get("profileId")
    image_path = pathlib.Path(str(request.get("imagePath", "")))
    mime_type = request.get("mimeType")
    settings = request.get("settings")
    if not isinstance(profile_id, str) or not profile_id or not isinstance(settings, dict):
        raise ValueError("INVALID_REQUEST:profile")
    if mime_type not in ALLOWED_MIME_TYPES:
        return response(request, started, outcome="unsupported_format", diagnostics={"reason": "mime_type"})

    maximum_bytes = integer_setting(settings, "maxBytes", 1, 50 * 1024 * 1024)
    maximum_pixels = integer_setting(settings, "maxPixels", 256 * 256, 100_000_000)
    minimum_dimension = integer_setting(settings, "minDimension", 32, 4096)
    maximum_threads = integer_setting(settings, "maxCpuThreads", 1, 8)
    threshold = number_setting(settings, "candidateDetectionThreshold", 0, 1)
    calibration_approved = settings.get("calibrationApproved")
    device_name = settings.get("device")
    if not isinstance(calibration_approved, bool) or not isinstance(device_name, str):
        raise ValueError("INVALID_PROFILE:runtime")
    if not image_path.is_file():
        return response(request, started, outcome="error", diagnostics={"reason": "image_missing"})
    if image_path.stat().st_size > maximum_bytes:
        return response(request, started, outcome="unsupported_format", diagnostics={"reason": "file_size"})

    from PIL import Image
    try:
        with Image.open(image_path) as image:
            width, height = image.size
            image.verify()
    except Exception as error:
        return response(request, started, outcome="unsupported_format", diagnostics={"reason": "decode", "errorType": type(error).__name__})
    if width < minimum_dimension or height < minimum_dimension or width * height > maximum_pixels:
        return response(request, started, outcome="unsupported_format", diagnostics={"reason": "dimensions", "width": width, "height": height})

    device = configure_runtime(maximum_threads, device_name) if decoder is decode_profile else device_name
    observation = decoder(profile_id, image_path, device)
    evaluation = evaluate_observation(profile_id, observation, threshold, calibration_approved)
    return response(
        request,
        started,
        outcome=evaluation["outcome"],
        score=evaluation["score"],
        threshold=evaluation["threshold"],
        payloadMatched=evaluation["payloadMatched"],
        payload=evaluation["payload"],
        attemptedViews=1,
        diagnostics={
            "bindingId": evaluation["bindingId"],
            "bindingClaim": evaluation["bindingClaim"],
            "payloadBits": evaluation["payloadBits"],
            "matchingBits": evaluation["matchingBits"],
            "minimumMatchingBits": evaluation["minimumMatchingBits"],
            "maskCoverage": evaluation["maskCoverage"],
            "maskMean": evaluation["maskMean"],
            "rawDetectionScore": evaluation["rawDetectionScore"],
            "configuredCandidateThreshold": evaluation["configuredCandidateThreshold"],
            "calibrationApproved": evaluation["calibrationApproved"],
            "device": device_name,
            "width": width,
            "height": height,
        },
    )


def main() -> None:
    request: dict[str, Any] = {}
    started = time.monotonic()
    try:
        request = json.loads(sys.stdin.readline())
        if not isinstance(request, dict):
            raise ValueError("INVALID_REQUEST:root")
        result = detect(request)
    except ArtifactUnavailable as error:
        result = response(request, started, outcome="detector_unavailable", diagnostics={"reason": str(error)[:256]})
    except Exception as error:
        result = response(request, started, outcome="error", diagnostics={"reason": type(error).__name__, "message": str(error)[:256]})
    sys.stdout.write(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
