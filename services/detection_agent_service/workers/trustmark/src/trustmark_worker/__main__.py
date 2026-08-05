from __future__ import annotations

import json
import os
import pathlib
import sys
import time
from typing import Any

from trustmark_worker.runtime import (
    ArtifactUnavailable,
    attempts_json,
    configure_torch,
    decode_image,
    evaluate_attempts,
    load_payload_registry,
    open_bounded_image,
    parse_csv_setting,
    MODEL_VARIANTS,
    VIEW_ROTATIONS,
)


PROTOCOL_VERSION = "1.0.0"
DETECTOR_VERSION = "adobe-trustmark@0.9.1:pq-cpu"
ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}


def required_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"INVALID_REQUEST:{field}")
    return value


def integer_setting(settings: dict[str, Any], field: str, minimum: int, maximum: int) -> int:
    value = settings.get(field)
    if not isinstance(value, int) or isinstance(value, bool) or value < minimum or value > maximum:
        raise ValueError(f"INVALID_PROFILE:{field}")
    return value


def response(request: dict[str, Any], started: float, **values: Any) -> dict[str, Any]:
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "schemeId": request.get("schemeId", "unknown"),
        "adapterId": request.get("adapterId", "trustmark-pq-v1"),
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


def detect(request: dict[str, Any], decoder_factory=None) -> dict[str, Any]:
    started = time.monotonic()
    if request.get("protocolVersion") != PROTOCOL_VERSION:
        raise ValueError("INVALID_REQUEST:protocolVersion")
    if request.get("adapterId") != "trustmark-pq-v1":
        raise ValueError("INVALID_REQUEST:adapterId")

    image_path = pathlib.Path(required_string(request.get("imagePath"), "imagePath"))
    mime_type = required_string(request.get("mimeType"), "mimeType")
    settings = request.get("settings")
    if not isinstance(settings, dict):
        raise ValueError("INVALID_REQUEST:settings")
    if mime_type not in ALLOWED_MIME_TYPES:
        return response(request, started, outcome="unsupported_format", diagnostics={"reason": "mime_type"})

    maximum_bytes = integer_setting(settings, "maxBytes", 1, 50 * 1024 * 1024)
    maximum_pixels = integer_setting(settings, "maxPixels", 224 * 224, 100_000_000)
    minimum_dimension = integer_setting(settings, "minDimension", 1, 4096)
    maximum_threads = integer_setting(settings, "maxCpuThreads", 1, 8)
    minimum_consistent_views = integer_setting(settings, "minimumConsistentViews", 1, 8)
    calibration_approved = settings.get("calibrationApproved")
    if not isinstance(calibration_approved, bool):
        raise ValueError("INVALID_PROFILE:calibrationApproved")
    models = parse_csv_setting(settings, "models", MODEL_VARIANTS, str)
    rotations = parse_csv_setting(settings, "rotations", VIEW_ROTATIONS, int)
    if minimum_consistent_views > len(models) * len(rotations):
        raise ValueError("INVALID_PROFILE:minimumConsistentViews")

    if not image_path.is_file():
        return response(request, started, outcome="error", diagnostics={"reason": "image_missing"})
    if image_path.stat().st_size > maximum_bytes:
        return response(request, started, outcome="unsupported_format", diagnostics={"reason": "file_size"})

    try:
        image = open_bounded_image(image_path, maximum_pixels)
    except Exception as error:
        return response(
            request,
            started,
            outcome="unsupported_format",
            diagnostics={"reason": "decode", "errorType": type(error).__name__},
        )
    width, height = image.size
    if width < minimum_dimension or height < minimum_dimension or width * height > maximum_pixels:
        return response(
            request,
            started,
            outcome="unsupported_format",
            diagnostics={"reason": "dimensions", "width": width, "height": height},
        )

    configure_torch(maximum_threads)
    attempts = decode_image(image, models, rotations, decoder_factory) if decoder_factory else decode_image(image, models, rotations)
    evaluation = evaluate_attempts(
        attempts,
        load_payload_registry(),
        calibration_approved,
        minimum_consistent_views,
    )
    return response(
        request,
        started,
        outcome=evaluation["outcome"],
        payloadMatched=evaluation["payloadMatched"],
        payload=evaluation["payload"],
        attemptedViews=len(attempts),
        diagnostics={
            "models": ",".join(models),
            "rotations": ",".join(str(rotation) for rotation in rotations),
            "bindingId": evaluation["bindingId"],
            "bindingClaim": evaluation["bindingClaim"],
            "consistentViews": evaluation["consistentViews"],
            "payloadConflict": evaluation["payloadConflict"],
            "calibrationApproved": calibration_approved,
            "attempts": attempts_json(attempts),
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
        result = response(
            request,
            started,
            outcome="detector_unavailable",
            diagnostics={"reason": str(error)[:256]},
        )
    except Exception as error:
        result = response(
            request,
            started,
            outcome="error",
            diagnostics={"reason": type(error).__name__, "message": str(error)[:256]},
        )
    sys.stdout.write(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
