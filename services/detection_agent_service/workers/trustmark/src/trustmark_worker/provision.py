from __future__ import annotations

import hashlib
import argparse
import json
import os
import pathlib
import tempfile
import urllib.request
from typing import Any


PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[2]
MANIFEST_PATH = PROJECT_ROOT / "resources" / "model-artifacts.v1.json"
MODEL_DIR = PROJECT_ROOT / "models"
FIXTURE_DIR = PROJECT_ROOT / "fixtures"


def _manifest() -> dict[str, Any]:
    value = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if value.get("schemaVersion") != "1.0.0" or not isinstance(value.get("models"), list):
        raise RuntimeError("INVALID_ARTIFACT_MANIFEST")
    return value


def _digests(path: pathlib.Path) -> tuple[int, str, str]:
    sha256 = hashlib.sha256()
    md5 = hashlib.md5(usedforsecurity=False)
    size = 0
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            size += len(chunk)
            sha256.update(chunk)
            md5.update(chunk)
    return size, sha256.hexdigest(), md5.hexdigest()


def _matches(path: pathlib.Path, artifact: dict[str, Any]) -> bool:
    if not path.is_file():
        return False
    size, sha256, md5 = _digests(path)
    return (
        size == artifact.get("sizeBytes")
        and sha256 == artifact.get("sha256")
        and md5 == artifact.get("md5")
    )


def _provision_group(artifacts: list[dict[str, Any]], target_directory: pathlib.Path) -> None:
    target_directory.mkdir(parents=True, exist_ok=True)
    for artifact in artifacts:
        target = target_directory / artifact["filename"]
        if _matches(target, artifact):
            print(f"verified {artifact['id']}")
            continue

        request = urllib.request.Request(
            artifact["url"],
            headers={"User-Agent": "content-detection-agent-trustmark-provision/1.0"},
        )
        descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=MODEL_DIR)
        os.close(descriptor)
        temporary = pathlib.Path(temporary_name)
        try:
            with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
            if not _matches(temporary, artifact):
                raise RuntimeError(f"ARTIFACT_DIGEST_MISMATCH:{artifact['id']}")
            os.replace(temporary, target)
            target.chmod(0o444)
            print(f"installed {artifact['id']}")
        finally:
            temporary.unlink(missing_ok=True)


def provision(include_fixtures: bool = False) -> None:
    manifest = _manifest()
    _provision_group(manifest["models"], MODEL_DIR)
    if include_fixtures:
        _provision_group(manifest.get("fixtures", []), FIXTURE_DIR)


def main() -> None:
    parser = argparse.ArgumentParser(description="Install pinned TrustMark artifacts after digest verification.")
    parser.add_argument("--include-fixtures", action="store_true")
    arguments = parser.parse_args()
    provision(include_fixtures=arguments.include_fixtures)


if __name__ == "__main__":
    main()
