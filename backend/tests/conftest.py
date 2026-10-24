from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.classifier import MODEL_DIR, SignClassifier
from app.landmarks import FACE, LEFT_HAND, POSE, RIGHT_HAND

FIXTURES = Path(__file__).parent / "fixtures"
FIXTURE_SIGNS = sorted(p.stem for p in FIXTURES.glob("*.npz"))

if not (MODEL_DIR / "model.tflite").exists():
    pytest.exit("Model not found. Run `uv run python scripts/download_model.py` first.", returncode=1)


def load_fixture(sign: str) -> np.ndarray:
    return np.load(FIXTURES / f"{sign}.npz")["frames"].astype(np.float32)


def to_request_frames(frames: np.ndarray) -> list[dict]:
    """Convert a (T, 543, 3) array to the JSON frames the web app sends."""

    def part(rows: np.ndarray) -> list[list[float]] | None:
        return None if np.isnan(rows[:, 0]).all() else rows.round(5).tolist()

    return [
        {"face": part(f[FACE]), "leftHand": part(f[LEFT_HAND]), "pose": part(f[POSE]), "rightHand": part(f[RIGHT_HAND])}
        for f in frames
    ]


@pytest.fixture(scope="session")
def classifier() -> SignClassifier:
    return SignClassifier()


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    from app.main import app

    with TestClient(app) as c:
        yield c
