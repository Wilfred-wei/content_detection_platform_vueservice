from __future__ import annotations

import hashlib
import json
import math
import os
import pathlib
import re
import sys
from typing import Any

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


Image.MAX_IMAGE_PIXELS = 100_000_000
TRANSFORM_PROTOCOL_VERSION = "1.0.0"
TRANSFORM_RECIPE_VERSION = "provenance-transform.v1"
TRANSFORM_OPERATIONS = frozenset({
    "resize",
    "recompression",
    "crop",
    "screenshot",
    "blur",
    "color_edit",
    "overlay",
    "metadata_removal",
    "visible_label_forgery",
    "adversarial",
})
ADVERSARIAL_PROFILES = frozenset({
    "social_jpeg_resize",
    "screenshot_jpeg",
    "blur_overlay",
    "metadata_label",
})


def required_text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"INVALID_REQUEST:{field}")
    return value


def bounded_integer(value: Any, field: str, minimum: int, maximum: int) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < minimum or value > maximum:
        raise ValueError(f"INVALID_REQUEST:{field}")
    return value


def normalized_region(value: Any) -> tuple[float, float, float, float] | None:
    if value is None:
        return None
    if not isinstance(value, list) or len(value) != 4 or any(not isinstance(item, (int, float)) or isinstance(item, bool) for item in value):
        raise ValueError("INVALID_REQUEST:region")
    x1, y1, x2, y2 = (float(item) for item in value)
    if not (0 <= x1 < x2 <= 1 and 0 <= y1 < y2 <= 1):
        raise ValueError("INVALID_REQUEST:region")
    return x1, y1, x2, y2


def exact_parameter_keys(value: dict[str, Any], expected: tuple[str, ...]) -> None:
    if tuple(sorted(value)) != tuple(sorted(expected)):
        raise ValueError("INVALID_REQUEST:parameters")


def bounded_number(value: Any, field: str, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        raise ValueError(f"INVALID_REQUEST:{field}")
    normalized = float(value)
    if not minimum <= normalized <= maximum:
        raise ValueError(f"INVALID_REQUEST:{field}")
    return normalized


def bounded_color(value: Any, field: str, channels: int = 4) -> tuple[int, ...]:
    if not isinstance(value, list) or len(value) != channels:
        raise ValueError(f"INVALID_REQUEST:{field}")
    values: list[int] = []
    for item in value:
        if not isinstance(item, int) or isinstance(item, bool) or not 0 <= item <= 255:
            raise ValueError(f"INVALID_REQUEST:{field}")
        values.append(item)
    return tuple(values)


def stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def digest_recipe(operation: str, parameters: dict[str, Any]) -> str:
    return digest_bytes(stable_json({
        "recipeVersion": TRANSFORM_RECIPE_VERSION,
        "operation": operation,
        "parameters": parameters,
    }).encode("utf-8"))


def image_box(image: Image.Image, region: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = region
    left = int(x1 * image.width)
    top = int(y1 * image.height)
    right = max(left + 1, int(x2 * image.width))
    bottom = max(top + 1, int(y2 * image.height))
    return left, top, min(image.width, right), min(image.height, bottom)


def rgb_background(value: Any, field: str) -> tuple[int, int, int]:
    color = bounded_color(value, field, channels=3)
    return color[0], color[1], color[2]


def normalize_rgba(image: Image.Image) -> Image.Image:
    return ImageOps.exif_transpose(image).convert("RGBA")


def hue_shift(image: Image.Image, degrees: float) -> Image.Image:
    if degrees == 0:
        return image
    alpha = image.getchannel("A")
    hsv = image.convert("RGB").convert("HSV")
    shift = int(round(degrees * 255 / 360))
    hue = hsv.getchannel("H").point(lambda value: (value + shift) % 256)
    shifted = Image.merge("HSV", (hue, hsv.getchannel("S"), hsv.getchannel("V"))).convert("RGB").convert("RGBA")
    shifted.putalpha(alpha)
    return shifted


def draw_overlay(image: Image.Image, region: tuple[float, float, float, float], rgba: tuple[int, ...]) -> Image.Image:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rectangle(image_box(image, region), fill=rgba)
    return Image.alpha_composite(image, layer)


def draw_visible_label(
    image: Image.Image,
    text: str,
    region: tuple[float, float, float, float],
    foreground: tuple[int, ...],
    background: tuple[int, ...],
) -> Image.Image:
    if not isinstance(text, str) or not re.fullmatch(r"[A-Za-z0-9 _-]{1,48}", text):
        raise ValueError("INVALID_REQUEST:text")
    output = image.copy()
    draw = ImageDraw.Draw(output, "RGBA")
    left, top, right, bottom = image_box(output, region)
    padding = max(2, min(24, round(min(right - left, bottom - top) * 0.08)))
    font_size = max(10, min(48, round(min(right - left, bottom - top) * 0.18)))
    try:
        font = ImageFont.load_default(size=font_size)
    except TypeError:
        font = ImageFont.load_default()
    text_box = draw.textbbox((0, 0), text, font=font)
    text_width = text_box[2] - text_box[0]
    text_height = text_box[3] - text_box[1]
    if text_width + 2 * padding > right - left or text_height + 2 * padding > bottom - top:
        raise ValueError("INVALID_REQUEST:textRegion")
    draw.rectangle((left, top, right, bottom), fill=background)
    draw.text(
        (left + (right - left - text_width) // 2, top + (bottom - top - text_height) // 2 - text_box[1]),
        text,
        fill=foreground,
        font=font,
    )
    return output


def parameter_dict(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or any(not isinstance(key, str) for key in value):
        raise ValueError("INVALID_REQUEST:parameters")
    return value


def resize_to(image: Image.Image, width: int, height: int) -> Image.Image:
    return image.resize((width, height), Image.Resampling.LANCZOS)


def adversarial_transform(image: Image.Image, profile: str, max_dimension: int) -> tuple[Image.Image, str]:
    if profile not in ADVERSARIAL_PROFILES:
        raise ValueError("INVALID_REQUEST:profile")
    if profile == "social_jpeg_resize":
        half_width = max(64, min(max_dimension, round(image.width * 0.5)))
        half_height = max(64, min(max_dimension, round(image.height * 0.5)))
        return resize_to(image, half_width, half_height), "jpeg"
    if profile == "screenshot_jpeg":
        viewport_width = min(max_dimension, 1024)
        viewport_height = min(max_dimension, 1024)
        canvas = Image.new("RGBA", (viewport_width, viewport_height), (255, 255, 255, 255))
        fitted = ImageOps.contain(image, canvas.size, Image.Resampling.LANCZOS)
        canvas.alpha_composite(fitted, ((viewport_width - fitted.width) // 2, (viewport_height - fitted.height) // 2))
        return canvas, "jpeg"
    if profile == "blur_overlay":
        blurred = image.filter(ImageFilter.GaussianBlur(radius=1.2))
        return draw_overlay(blurred, (0.42, 0.42, 0.58, 0.58), (255, 255, 255, 28)), "png"
    return draw_visible_label(
        image,
        "AI GENERATED",
        (0.04, 0.84, 0.96, 0.98),
        (255, 255, 255, 255),
        (176, 0, 0, 210),
    ), "png"


def transform_image(
    image: Image.Image,
    operation: str,
    parameters: dict[str, Any],
    max_dimension: int,
) -> tuple[Image.Image, str]:
    if operation not in TRANSFORM_OPERATIONS:
        raise ValueError("INVALID_REQUEST:operation")
    if operation == "resize":
        exact_parameter_keys(parameters, ("width", "height"))
        width = bounded_integer(parameters["width"], "parameters.width", 1, max_dimension)
        height = bounded_integer(parameters["height"], "parameters.height", 1, max_dimension)
        return resize_to(image, width, height), "png"
    if operation == "recompression":
        exact_parameter_keys(parameters, ("quality",))
        bounded_integer(parameters["quality"], "parameters.quality", 1, 100)
        return image, "jpeg"
    if operation == "crop":
        exact_parameter_keys(parameters, ("region",))
        region = normalized_region(parameters["region"])
        assert region is not None
        return image.crop(image_box(image, region)), "png"
    if operation == "screenshot":
        exact_parameter_keys(parameters, ("viewportWidth", "viewportHeight", "deviceScaleFactor", "background"))
        viewport_width = bounded_integer(parameters["viewportWidth"], "parameters.viewportWidth", 64, max_dimension)
        viewport_height = bounded_integer(parameters["viewportHeight"], "parameters.viewportHeight", 64, max_dimension)
        device_scale = bounded_integer(parameters["deviceScaleFactor"], "parameters.deviceScaleFactor", 1, 3)
        background = rgb_background(parameters["background"], "parameters.background")
        size = (viewport_width * device_scale, viewport_height * device_scale)
        canvas = Image.new("RGBA", size, (*background, 255))
        fitted = ImageOps.contain(image, size, Image.Resampling.LANCZOS)
        canvas.alpha_composite(fitted, ((size[0] - fitted.width) // 2, (size[1] - fitted.height) // 2))
        return canvas, "png"
    if operation == "blur":
        exact_parameter_keys(parameters, ("radius",))
        radius = bounded_number(parameters["radius"], "parameters.radius", 0, 50)
        return image.filter(ImageFilter.GaussianBlur(radius=radius)), "png"
    if operation == "color_edit":
        exact_parameter_keys(parameters, ("brightness", "contrast", "saturation", "hueDegrees"))
        output = ImageEnhance.Brightness(image).enhance(bounded_number(parameters["brightness"], "parameters.brightness", 0, 3))
        output = ImageEnhance.Contrast(output).enhance(bounded_number(parameters["contrast"], "parameters.contrast", 0, 3))
        output = ImageEnhance.Color(output).enhance(bounded_number(parameters["saturation"], "parameters.saturation", 0, 3))
        return hue_shift(output, bounded_number(parameters["hueDegrees"], "parameters.hueDegrees", -180, 180)), "png"
    if operation == "overlay":
        exact_parameter_keys(parameters, ("region", "rgba"))
        region = normalized_region(parameters["region"])
        assert region is not None
        return draw_overlay(image, region, bounded_color(parameters["rgba"], "parameters.rgba")), "png"
    if operation == "metadata_removal":
        exact_parameter_keys(parameters, ("outputFormat", "quality"))
        output_format = parameters["outputFormat"]
        if output_format not in ("png", "jpeg"):
            raise ValueError("INVALID_REQUEST:parameters.outputFormat")
        quality = bounded_integer(parameters["quality"], "parameters.quality", 1, 100)
        return image, ("jpeg" if output_format == "jpeg" else "png")
    if operation == "visible_label_forgery":
        exact_parameter_keys(parameters, ("text", "region", "rgba", "background"))
        region = normalized_region(parameters["region"])
        assert region is not None
        return draw_visible_label(
            image,
            parameters["text"],
            region,
            bounded_color(parameters["rgba"], "parameters.rgba"),
            bounded_color(parameters["background"], "parameters.background"),
        ), "png"
    exact_parameter_keys(parameters, ("profile",))
    return adversarial_transform(image, parameters["profile"], max_dimension)


def save_transformed(image: Image.Image, target: pathlib.Path, output_format: str, parameters: dict[str, Any]) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".tmp")
    if output_format == "jpeg":
        quality = int(parameters.get("quality", 50 if parameters.get("profile") == "social_jpeg_resize" else 75))
        image.convert("RGB").save(
            temporary,
            format="JPEG",
            quality=quality,
            subsampling=0,
            optimize=False,
            progressive=False,
            exif=b"",
        )
    else:
        image.save(temporary, format="PNG", optimize=False, compress_level=9)
    os.replace(temporary, target)


def transform(request: dict[str, Any]) -> dict[str, Any]:
    if request.get("protocolVersion") != TRANSFORM_PROTOCOL_VERSION:
        raise ValueError("INVALID_REQUEST:protocolVersion")
    operation = request.get("operation")
    if not isinstance(operation, str):
        raise ValueError("INVALID_REQUEST:operation")
    parameters = parameter_dict(request.get("parameters"))
    source = pathlib.Path(required_text(request.get("inputPath"), "inputPath"))
    target = pathlib.Path(required_text(request.get("outputPath"), "outputPath"))
    max_bytes = bounded_integer(request.get("maxInputBytes"), "maxInputBytes", 1, 50 * 1024 * 1024)
    max_pixels = bounded_integer(request.get("maxPixels"), "maxPixels", 1, 100_000_000)
    max_dimension = bounded_integer(request.get("maxDimension"), "maxDimension", 64, 4096)
    if not source.is_file() or source.stat().st_size > max_bytes:
        raise ValueError("INVALID_REQUEST:inputPath")
    source_digest = digest_bytes(source.read_bytes())
    with Image.open(source) as opened:
        opened.load()
        if opened.width * opened.height > max_pixels:
            raise ValueError("IMAGE_PIXEL_LIMIT")
        image, output_format = transform_image(normalize_rgba(opened), operation, parameters, max_dimension)
        if image.width < 1 or image.height < 1 or image.width * image.height > max_pixels or max(image.size) > max_dimension:
            raise ValueError("IMAGE_OUTPUT_LIMIT")
        save_transformed(image, target, output_format, parameters)
    output_bytes = target.read_bytes()
    output_mime = "image/jpeg" if output_format == "jpeg" else "image/png"
    return {
        "protocolVersion": TRANSFORM_PROTOCOL_VERSION,
        "recipeVersion": TRANSFORM_RECIPE_VERSION,
        "status": "completed",
        "operation": operation,
        "parameters": parameters,
        "recipeSha256": digest_recipe(operation, parameters),
        "inputPath": str(source),
        "inputSha256": source_digest,
        "outputPath": str(target),
        "outputMimeType": output_mime,
        "outputSha256": digest_bytes(output_bytes),
        "outputBytes": len(output_bytes),
        "width": image.width,
        "height": image.height,
        "pixels": image.width * image.height,
        "metadataRemoved": True,
    }


def render(request: dict[str, Any]) -> dict[str, Any]:
    if request.get("protocolVersion") != "1.0.0":
        raise ValueError("INVALID_REQUEST:protocolVersion")
    source = pathlib.Path(required_text(request.get("inputPath"), "inputPath"))
    target = pathlib.Path(required_text(request.get("outputPath"), "outputPath"))
    max_bytes = bounded_integer(request.get("maxInputBytes"), "maxInputBytes", 1, 50 * 1024 * 1024)
    max_pixels = bounded_integer(request.get("maxPixels"), "maxPixels", 1, 100_000_000)
    max_dimension = bounded_integer(request.get("maxDimension"), "maxDimension", 64, 4096)
    region = normalized_region(request.get("region"))

    if not source.is_file() or source.stat().st_size > max_bytes:
        raise ValueError("INVALID_REQUEST:inputPath")
    with Image.open(source) as opened:
        opened.load()
        image = ImageOps.exif_transpose(opened)
        if image.width * image.height > max_pixels:
            raise ValueError("IMAGE_PIXEL_LIMIT")
        if region:
            x1, y1, x2, y2 = region
            box = (
                int(x1 * image.width),
                int(y1 * image.height),
                max(int(x2 * image.width), int(x1 * image.width) + 1),
                max(int(y2 * image.height), int(y1 * image.height) + 1),
            )
            image = image.crop(box)
        image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + ".tmp")
        image.save(temporary, format="PNG", optimize=True)
        os.replace(temporary, target)

    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    return {
        "protocolVersion": "1.0.0",
        "outputPath": str(target),
        "mimeType": "image/png",
        "sha256": digest,
        "width": image.width,
        "height": image.height,
        "pixels": image.width * image.height,
    }


def main() -> None:
    try:
        request = json.loads(sys.stdin.readline())
        if not isinstance(request, dict):
            raise ValueError("INVALID_REQUEST:root")
        if request.get("operation") is not None:
            result = transform(request)
        else:
            result = {"status": "completed", **render(request)}
    except Exception as error:
        result = {"protocolVersion": "1.0.0", "status": "error", "error": type(error).__name__, "message": str(error)[:256]}
    sys.stdout.write(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
