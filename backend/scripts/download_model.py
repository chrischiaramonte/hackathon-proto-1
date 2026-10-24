"""Download the pretrained ASL Signs model into backend/models/.

Pinned to a specific Hugging Face commit and verified by SHA-256, so every
teammate runs the exact model the thresholds were calibrated on.

Usage:
    python scripts/download_model.py
"""

from __future__ import annotations

import hashlib
import shutil
import urllib.request
from pathlib import Path

from _https import SSL_CONTEXT

REPO = "https://huggingface.co/sign/kaggle-asl-signs-1st-place/resolve/d831c2f58cefbc5110dfbb91cc8e6eb516b4ccfc"
FILES = {
    "model.tflite": "f55a2bb1ebe6d1e912a98e31c6ef3f995c9ae261f408fe115f2008099d3f0bb7",
    "sign_to_prediction_index_map.json": "1fe747c2f44c68dbb396947e35193c96d363f3dede0be8defa5e08546400bf5d",
}
MODEL_DIR = Path(__file__).resolve().parents[1] / "models"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    MODEL_DIR.mkdir(exist_ok=True)
    for name, digest in FILES.items():
        dest = MODEL_DIR / name
        if dest.exists() and sha256(dest) == digest:
            print(f"{name}: already present")
            continue
        print(f"{name}: downloading")
        with urllib.request.urlopen(f"{REPO}/{name}", context=SSL_CONTEXT) as resp, dest.open("wb") as out:
            shutil.copyfileobj(resp, out)
        if sha256(dest) != digest:
            dest.unlink()
            raise SystemExit(f"{name}: checksum mismatch, download removed")
    print(f"Model files are in {MODEL_DIR}")


if __name__ == "__main__":
    main()
