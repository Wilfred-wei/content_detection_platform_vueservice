from __future__ import annotations

import json
import os
import sys
import time
from typing import Any

import cv2

from watermark_classic_worker.dwt_dct import DwtDctDecoder
from watermark_classic_worker.dwt_dct_svd import DwtDctSvdDecoder
from watermark_classic_worker.rivagan import RivaGanDecoder


PROTOCOL_VERSION = "1.0.0"
DETECTOR_VERSION = "shieldmnt-invisible-watermark@0.2.0"
ADAPTER_IDS = {"sdxl-dwt-dct-v1", "classic-invisible-watermarks-v1"}
ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}


def _required_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"INVALID_REQUEST:{field}")
    return value


def _integer_setting(settings: dict[str, Any], field: str, minimum: int) -> int:
    value = settings.get(field)
    if not isinstance(value, int) or isinstance(value, bool) or value < minimum:
        raise ValueError(f"INVALID_PROFILE:{field}")
    return value


def _number_setting(settings: dict[str, Any], field: str, minimum: float, maximum: float) -> float:
    value = settings.get(field)
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not minimum <= float(value) <= maximum:
        raise ValueError(f"INVALID_PROFILE:{field}")
    return float(value)


def _response(request: dict[str, Any], started: float, **values: Any) -> dict[str, Any]:
    settings = request.get("settings")
    method = settings.get("method", "unknown") if isinstance(settings, dict) else "unknown"
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "schemeId": request.get("schemeId", "unknown"),
        "adapterId": request.get("adapterId", "sdxl-dwt-dct-v1"),
        "detectorVersion": f"{DETECTOR_VERSION}:{method}",
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


def detect(request: dict[str, Any]) -> dict[str, Any]:
    started = time.monotonic()
    if request.get("protocolVersion") != PROTOCOL_VERSION:
        raise ValueError("INVALID_REQUEST:protocolVersion")
    if request.get("adapterId") not in ADAPTER_IDS:
        raise ValueError("INVALID_REQUEST:adapterId")

    image_path = _required_string(request.get("imagePath"), "imagePath")
    mime_type = _required_string(request.get("mimeType"), "mimeType")
    settings = request.get("settings")
    if not isinstance(settings, dict):
        raise ValueError("INVALID_REQUEST:settings")
    if mime_type not in ALLOWED_MIME_TYPES:
        return _response(request, started, outcome="unsupported_format", diagnostics={"reason": "mime_type"})

    maximum_bytes = _integer_setting(settings, "maxBytes", 1)
    maximum_pixels = _integer_setting(settings, "maxPixels", 256 * 256)
    maximum_threads = _integer_setting(settings, "maxCpuThreads", 1)
    if maximum_threads > 8:
        raise ValueError("INVALID_PROFILE:maxCpuThreads")
    cv2.setNumThreads(maximum_threads)
    if not os.path.isfile(image_path):
        return _response(request, started, outcome="error", diagnostics={"reason": "image_missing"})
    if os.path.getsize(image_path) > maximum_bytes:
        return _response(request, started, outcome="unsupported_format", diagnostics={"reason": "file_size"})

    image = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if image is None:
        return _response(request, started, outcome="unsupported_format", diagnostics={"reason": "decode"})
    height, width = image.shape[:2]
    if width < 256 or height < 256 or width * height > maximum_pixels:
        return _response(
            request,
            started,
            outcome="unsupported_format",
            diagnostics={"reason": "dimensions", "width": width, "height": height},
        )

    expected_hex = _required_string(settings.get("expectedPayloadHex"), "expectedPayloadHex").lower()
    expected_bits_count = _integer_setting(settings, "expectedPayloadBits", 1)
    if len(expected_hex) * 4 != expected_bits_count:
        raise ValueError("INVALID_PROFILE:expectedPayloadHex")
    expected_bits = [int(bit) for bit in f"{int(expected_hex, 16):0{expected_bits_count}b}"]
    method = _required_string(settings.get("method"), "method")
    if method not in {"dwtDct", "dwtDctSvd", "rivaGan"}:
        raise ValueError("INVALID_PROFILE:method")

    if method == "dwtDct":
        decoded_bits = DwtDctDecoder(expected_bits_count).decode(image)
    elif method == "dwtDctSvd":
        decoded_bits = DwtDctSvdDecoder(expected_bits_count).decode(image)
    else:
        decoder_threshold = _number_setting(settings, "decoderThreshold", 0, 1)
        decoded_bits = RivaGanDecoder(expected_bits_count, decoder_threshold, maximum_threads).decode(image)
    matches = sum(actual == expected for actual, expected in zip(decoded_bits, expected_bits, strict=True))
    possible_matches = _integer_setting(settings, "possibleMatchMinimum", 1)
    likely_matches = _integer_setting(settings, "likelyMatchMinimum", possible_matches)
    very_likely_matches = _integer_setting(settings, "veryLikelyMatchMinimum", likely_matches)
    if not possible_matches <= likely_matches <= very_likely_matches <= expected_bits_count:
        raise ValueError("INVALID_PROFILE:matchThresholds")

    # Until scheme-specific calibration is approved, lower match bands are
    # diagnostics only. This avoids surfacing a high-rate random match as a
    # positive watermark signal.
    outcome = "possibly_present" if matches >= very_likely_matches else "not_detected"

    return _response(
        request,
        started,
        outcome=outcome,
        score=matches / expected_bits_count,
        threshold=very_likely_matches / expected_bits_count,
        payloadMatched=matches == expected_bits_count,
        payload=f"{int(''.join(str(bit) for bit in decoded_bits), 2):0{len(expected_hex)}x}",
        attemptedViews=1,
        diagnostics={
            "matchedBits": matches,
            "totalBits": expected_bits_count,
            "possibleMatchMinimum": possible_matches,
            "likelyMatchMinimum": likely_matches,
            "veryLikelyMatchMinimum": very_likely_matches,
            "calibrationApproved": False,
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
        response = detect(request)
    except Exception as error:  # Worker failures are normalized by the parent adapter.
        response = _response(
            request,
            started,
            outcome="error",
            diagnostics={"reason": type(error).__name__, "message": str(error)[:256]},
        )
    sys.stdout.write(json.dumps(response, separators=(",", ":")))


if __name__ == "__main__":
    main()
