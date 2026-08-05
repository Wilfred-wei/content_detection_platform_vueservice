from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import tempfile
import urllib.request
import zipfile


PROJECT_ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = PROJECT_ROOT / "resources" / "model-artifacts.v1.json"
MODEL_DIR = PROJECT_ROOT / "models"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    bundle = manifest["bundle"]
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=".invisible-watermark.", suffix=".whl", dir=MODEL_DIR)
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        request = urllib.request.Request(bundle["url"], headers={"User-Agent": "content-detection-agent-classic-provision/1.0"})
        with urllib.request.urlopen(request, timeout=300) as response:
            content = response.read(bundle["sizeBytes"] + 1)
        if len(content) != bundle["sizeBytes"] or digest(content) != bundle["sha256"]:
            raise RuntimeError("ARTIFACT_DIGEST_MISMATCH:invisible-watermark-wheel")
        temporary.write_bytes(content)
        with zipfile.ZipFile(temporary) as archive:
            for artifact in manifest["models"]:
                model = archive.read(artifact["member"])
                if digest(model) != artifact["sha256"]:
                    raise RuntimeError(f"ARTIFACT_DIGEST_MISMATCH:{artifact['id']}")
                target = MODEL_DIR / artifact["filename"]
                if target.is_file() and target.read_bytes() == model:
                    target.chmod(0o444)
                    print(f"verified {artifact['id']}")
                    continue
                target.write_bytes(model)
                target.chmod(0o444)
                print(f"installed {artifact['id']}")
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
