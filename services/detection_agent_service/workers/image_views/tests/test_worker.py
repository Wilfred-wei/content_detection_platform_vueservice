import pathlib
import tempfile
import unittest

from PIL import Image

from image_view_worker.__main__ import render, transform


class ImageViewWorkerTest(unittest.TestCase):
    def test_creates_bounded_crop_and_digest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = root / "source.png"
            target = root / "view.png"
            Image.new("RGB", (400, 200), "white").save(source)
            result = render({
                "protocolVersion": "1.0.0",
                "inputPath": str(source),
                "outputPath": str(target),
                "region": [0.5, 0, 1, 1],
                "maxInputBytes": 1_000_000,
                "maxPixels": 1_000_000,
                "maxDimension": 100,
            })
            self.assertEqual((result["width"], result["height"]), (100, 100))
            self.assertEqual(len(result["sha256"]), 64)
            self.assertTrue(target.is_file())

    def test_rejects_invalid_region(self):
        with self.assertRaisesRegex(ValueError, "region"):
            render({
                "protocolVersion": "1.0.0", "inputPath": "missing", "outputPath": "out",
                "region": [0.8, 0, 0.2, 1], "maxInputBytes": 10, "maxPixels": 10, "maxDimension": 64,
            })

    def test_reproducible_transformations_return_recipe_and_digest(self):
        operations = [
            ("resize", {"width": 192, "height": 128}),
            ("recompression", {"quality": 65}),
            ("crop", {"region": [0.1, 0.1, 0.9, 0.9]}),
            ("screenshot", {"viewportWidth": 256, "viewportHeight": 192, "deviceScaleFactor": 1, "background": [240, 240, 240]}),
            ("blur", {"radius": 1.25}),
            ("color_edit", {"brightness": 1.05, "contrast": 0.95, "saturation": 1.1, "hueDegrees": 12}),
            ("overlay", {"region": [0.2, 0.2, 0.8, 0.8], "rgba": [255, 0, 0, 32]}),
            ("metadata_removal", {"outputFormat": "png", "quality": 90}),
            ("visible_label_forgery", {"text": "AI GENERATED", "region": [0.05, 0.75, 0.95, 0.98], "rgba": [255, 255, 255, 255], "background": [180, 0, 0, 220]}),
            ("adversarial", {"profile": "social_jpeg_resize"}),
            ("adversarial", {"profile": "screenshot_jpeg"}),
            ("adversarial", {"profile": "blur_overlay"}),
            ("adversarial", {"profile": "metadata_label"}),
        ]
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = root / "source.png"
            image = Image.new("RGBA", (320, 240), (30, 90, 180, 255))
            for x in range(40, 280):
                for y in range(30, 210):
                    image.putpixel((x, y), (x % 256, y % 256, 120, 255))
            image.save(source, format="PNG", optimize=False)
            for index, (operation, parameters) in enumerate(operations):
                first = transform({
                    "protocolVersion": "1.0.0", "operation": operation, "parameters": parameters,
                    "inputPath": str(source), "outputPath": str(root / f"first-{index}.out"),
                    "maxInputBytes": 1_000_000, "maxPixels": 2_000_000, "maxDimension": 1024,
                })
                second = transform({
                    "protocolVersion": "1.0.0", "operation": operation, "parameters": parameters,
                    "inputPath": str(source), "outputPath": str(root / f"second-{index}.out"),
                    "maxInputBytes": 1_000_000, "maxPixels": 2_000_000, "maxDimension": 1024,
                })
                self.assertEqual(first["recipeSha256"], second["recipeSha256"])
                self.assertEqual(first["outputSha256"], second["outputSha256"], operation)
                self.assertTrue(first["metadataRemoved"])
                self.assertGreater(first["outputBytes"], 0)

    def test_metadata_removal_and_recompression_drop_exif(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = root / "source.jpg"
            target = root / "target.jpg"
            exif = Image.Exif()
            exif[306] = "2026:08:03 12:00:00"
            Image.new("RGB", (160, 120), "white").save(source, format="JPEG", exif=exif)
            transform({
                "protocolVersion": "1.0.0", "operation": "metadata_removal",
                "parameters": {"outputFormat": "jpeg", "quality": 80},
                "inputPath": str(source), "outputPath": str(target),
                "maxInputBytes": 1_000_000, "maxPixels": 1_000_000, "maxDimension": 1024,
            })
            with Image.open(target) as output:
                self.assertEqual(output.getexif().get(306), None)

    def test_rejects_unknown_adversarial_profile_and_parameter_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = root / "source.png"
            Image.new("RGB", (100, 100), "white").save(source)
            request = {
                "protocolVersion": "1.0.0", "operation": "adversarial", "parameters": {"profile": "unknown"},
                "inputPath": str(source), "outputPath": str(root / "out.png"),
                "maxInputBytes": 1_000_000, "maxPixels": 1_000_000, "maxDimension": 1024,
            }
            with self.assertRaisesRegex(ValueError, "profile"):
                transform(request)
            request["parameters"] = {"width": 50, "height": 50}
            with self.assertRaisesRegex(ValueError, "parameters"):
                transform(request)

    def test_rejects_transformation_output_over_resource_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = root / "source.png"
            Image.new("RGB", (100, 100), "white").save(source)
            with self.assertRaisesRegex(ValueError, "IMAGE_OUTPUT_LIMIT"):
                transform({
                    "protocolVersion": "1.0.0", "operation": "adversarial",
                    "parameters": {"profile": "screenshot_jpeg"},
                    "inputPath": str(source), "outputPath": str(root / "out.jpg"),
                    "maxInputBytes": 1_000_000, "maxPixels": 1_000_000, "maxDimension": 1024,
                })


if __name__ == "__main__":
    unittest.main()
