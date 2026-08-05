from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import shutil
import tarfile
import tempfile
import urllib.request
from typing import Any


PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[2]
MANIFEST_PATH = PROJECT_ROOT / "resources" / "model-artifacts.v1.json"
MODEL_DIR = PROJECT_ROOT / "models"
VENDOR_DIR = PROJECT_ROOT / "vendor"


def manifest() -> dict[str, Any]:
    value = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if value.get("schemaVersion") != "1.0.0" or not isinstance(value.get("models"), list):
        raise RuntimeError("INVALID_ARTIFACT_MANIFEST")
    return value


def digest(path: pathlib.Path) -> tuple[int, str]:
    sha256 = hashlib.sha256()
    size = 0
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
            size += len(chunk)
            sha256.update(chunk)
    return size, sha256.hexdigest()


def matches(path: pathlib.Path, artifact: dict[str, Any]) -> bool:
    if not path.is_file():
        return False
    size, sha256 = digest(path)
    return size == artifact.get("sizeBytes") and sha256 == artifact.get("sha256")


def provision_model(artifact: dict[str, Any]) -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    target = MODEL_DIR / artifact["filename"]
    if matches(target, artifact):
        target.chmod(0o444)
        print(f"verified {artifact['id']}")
        return
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=MODEL_DIR)
    os.close(descriptor)
    temporary = pathlib.Path(temporary_name)
    request = urllib.request.Request(artifact["url"], headers={"User-Agent": "content-detection-agent-meta-provision/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=300) as response, temporary.open("wb") as output:
            while chunk := response.read(8 * 1024 * 1024):
                output.write(chunk)
        if not matches(temporary, artifact):
            raise RuntimeError(f"ARTIFACT_DIGEST_MISMATCH:{artifact['id']}")
        os.replace(temporary, target)
        target.chmod(0o444)
        print(f"installed {artifact['id']}")
    finally:
        temporary.unlink(missing_ok=True)


def _safe_extract(archive: pathlib.Path, destination: pathlib.Path) -> pathlib.Path:
    with tarfile.open(archive, "r:gz") as bundle:
        members = bundle.getmembers()
        roots = {pathlib.PurePosixPath(member.name).parts[0] for member in members if pathlib.PurePosixPath(member.name).parts}
        if len(roots) != 1:
            raise RuntimeError("INVALID_SOURCE_ARCHIVE_ROOT")
        destination_resolved = destination.resolve()
        for member in members:
            target = (destination / member.name).resolve()
            if destination_resolved not in target.parents and target != destination_resolved:
                raise RuntimeError("INVALID_SOURCE_ARCHIVE_PATH")
        bundle.extractall(destination)
    return destination / next(iter(roots))


def provision_source(name: str, artifact: dict[str, Any], source_cache: pathlib.Path | None = None) -> None:
    target = VENDOR_DIR / name
    receipt = target / ".source.json"
    VENDOR_DIR.mkdir(parents=True, exist_ok=True)
    if receipt.is_file():
        current = json.loads(receipt.read_text(encoding="utf-8"))
        if current.get("commit") == artifact.get("commit") and current.get("sha256") == artifact.get("sha256"):
            print(f"verified {name} source")
            return
    if target.exists():
        raise RuntimeError(f"SOURCE_REVISION_MISMATCH:{name}")

    with tempfile.TemporaryDirectory(prefix=f".{name}.", dir=VENDOR_DIR) as temporary_directory:
        temporary_root = pathlib.Path(temporary_directory)
        archive = temporary_root / "source.tar.gz"
        cached = source_cache / artifact["filename"] if source_cache else None
        if cached and matches(cached, artifact):
            shutil.copyfile(cached, archive)
        else:
            request = urllib.request.Request(artifact["url"], headers={"User-Agent": "content-detection-agent-meta-provision/1.0"})
            with urllib.request.urlopen(request, timeout=300) as response, archive.open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
        if not matches(archive, artifact):
            raise RuntimeError(f"SOURCE_DIGEST_MISMATCH:{name}")
        extracted = _safe_extract(archive, temporary_root / "extracted")
        shutil.move(str(extracted), target)
        receipt.write_text(json.dumps({"commit": artifact["commit"], "sha256": artifact["sha256"]}, sort_keys=True) + "\n", encoding="utf-8")
    print(f"installed {name} source")


def provision(profiles: set[str] | None = None, source_cache: pathlib.Path | None = None) -> None:
    value = manifest()
    selected = [artifact for artifact in value["models"] if profiles is None or artifact["profileId"] in profiles]
    if any(artifact["profileId"] in {"videoseal-v1", "pixelseal", "chunkyseal"} for artifact in selected):
        provision_source("videoseal", value["sources"]["videoseal"], source_cache)
    if any(artifact["profileId"] == "wam-mit" for artifact in selected):
        provision_source("watermark-anything", value["sources"]["watermark-anything"], source_cache)
    for artifact in selected:
        provision_model(artifact)


def main() -> None:
    parser = argparse.ArgumentParser(description="Install pinned Meta watermark source and model artifacts.")
    parser.add_argument("--profile", action="append", choices=["videoseal-v1", "pixelseal", "chunkyseal", "wam-mit"])
    parser.add_argument("--source-cache", type=pathlib.Path, help="Optional directory containing already downloaded, still digest-verified source archives.")
    arguments = parser.parse_args()
    provision(set(arguments.profile) if arguments.profile else None, arguments.source_cache)


if __name__ == "__main__":
    main()
