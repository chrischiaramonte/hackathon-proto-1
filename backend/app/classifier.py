"""Inference with the 1st-place Kaggle "ASL Signs" TFLite model.

Model: https://huggingface.co/sign/kaggle-asl-signs-1st-place (MIT), from
https://github.com/hoyso48/Google---Isolated-Sign-Language-Recognition-1st-place-solution

Facts verified against the model file and the original training notebook:
- Signature "serving_default": inputs (T, 543, 3) float32 -> outputs (250,).
- Outputs are logits (an ensemble average), not probabilities, so we softmax.
- Normalisation happens inside the graph: centre on lip landmark 17, divide by
  the per-axis std of the selected landmarks, keep x/y only, NaN -> 0, and
  truncate to the first 384 frames. Pose rows and z are ignored, and per-axis
  scaling is normalised away, so the camera's aspect ratio does not matter.
- Training dropped frames in which every selected landmark is NaN, but the
  graph does not. We do it here, because such frames change the logits.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path

import numpy as np
from ai_edge_litert.interpreter import Interpreter

# Landmarks the model reads (POINT_LANDMARKS in the original notebook).
_LIP = [
    0, 61, 185, 40, 39, 37, 267, 269, 270, 409, 291, 146, 91, 181, 84, 17, 314, 405, 321, 375,
    78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308,
]
_NOSE = [1, 2, 98, 327]
_REYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 246, 161, 160, 159, 158, 157, 173]
_LEYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 466, 388, 387, 386, 385, 384, 398]
MODEL_LANDMARKS = np.array(
    _LIP + list(range(468, 489)) + list(range(522, 543)) + _NOSE + _REYE + _LEYE
)
MAX_FRAMES = 384

MODEL_DIR = Path(__file__).resolve().parent.parent / "models"


def drop_empty_frames(frames: np.ndarray) -> np.ndarray:
    """Remove frames in which none of the model's landmarks were detected."""
    keep = ~np.isnan(frames[:, MODEL_LANDMARKS]).all(axis=(1, 2))
    return frames[keep]


def softmax(logits: np.ndarray) -> np.ndarray:
    z = np.exp(logits - logits.max())
    return z / z.sum()


class SignClassifier:
    def __init__(
        self,
        model_path: Path = MODEL_DIR / "model.tflite",
        label_map_path: Path = MODEL_DIR / "sign_to_prediction_index_map.json",
    ) -> None:
        index: dict[str, int] = json.loads(label_map_path.read_text())
        self.labels: list[str] = [sign for sign, _ in sorted(index.items(), key=lambda kv: kv[1])]
        self.index = index
        self._interpreter = Interpreter(model_path=str(model_path))
        self._runner = self._interpreter.get_signature_runner("serving_default")
        # A TFLite interpreter must not be invoked from two threads at once, and
        # FastAPI runs sync endpoints on a thread pool.
        self._lock = threading.Lock()

    def predict(self, frames: np.ndarray) -> np.ndarray:
        """Return class probabilities (250,) for a (T, 543, 3) landmark sequence.

        Callers must make sure at least one frame survives drop_empty_frames.
        """
        frames = drop_empty_frames(frames.astype(np.float32, copy=False))
        if len(frames) == 0:
            raise ValueError("no frame contains any landmark the model uses")
        with self._lock:
            logits = self._runner(inputs=frames)["outputs"]
        return softmax(logits.astype(np.float64))
