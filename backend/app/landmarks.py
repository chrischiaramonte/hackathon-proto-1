"""Frame layout expected by the Kaggle "ASL Signs" model.

Every frame is 543 MediaPipe Holistic landmarks, concatenated in this order
(the row order of the competition's parquet files):

    rows   0-467  face        (468-point mesh, i.e. refine_face_landmarks=False)
    rows 468-488  left hand   (21)
    rows 489-521  pose        (33)
    rows 522-542  right hand  (21)

Each row is MediaPipe's normalised (x, y, z) in the *unmirrored* camera image.
A part MediaPipe did not detect (most often a hand) is all-NaN, exactly as in
the training data. The model never sees pixels, only these coordinates.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

FACE_POINTS = 468
HAND_POINTS = 21
POSE_POINTS = 33
ROWS_PER_FRAME = FACE_POINTS + HAND_POINTS + POSE_POINTS + HAND_POINTS  # 543

FACE = slice(0, 468)
LEFT_HAND = slice(468, 489)
POSE = slice(489, 522)
RIGHT_HAND = slice(522, 543)

Points = Sequence[Sequence[float]]


def frame_to_rows(
    face: Points | None,
    left_hand: Points | None,
    pose: Points | None,
    right_hand: Points | None,
) -> np.ndarray:
    """Assemble one frame of MediaPipe Holistic output into a (543, 3) array."""
    rows = np.full((ROWS_PER_FRAME, 3), np.nan, dtype=np.float32)
    for points, part in ((face, FACE), (left_hand, LEFT_HAND), (pose, POSE), (right_hand, RIGHT_HAND)):
        if points is not None:
            rows[part] = np.asarray(points, dtype=np.float32)
    return rows


def present(frames: np.ndarray, part: slice) -> np.ndarray:
    """Boolean (T,) mask of frames in which `part` was detected."""
    return ~np.isnan(frames[:, part, 0]).all(axis=1)


# Left/right landmark pairs, as swapped by flip_lr in the original training notebook.
_MIRROR_PAIRS = [
    (list(range(468, 489)), list(range(522, 543))),  # hands
    ([84, 181, 91, 146, 61, 185, 40, 39, 37, 87, 178, 88, 95, 78, 191, 80, 81, 82],
     [314, 405, 321, 375, 291, 409, 270, 269, 267, 317, 402, 318, 324, 308, 415, 310, 311, 312]),  # lips
    ([263, 249, 390, 373, 374, 380, 381, 382, 362, 466, 388, 387, 386, 385, 384, 398],
     [33, 7, 163, 144, 145, 153, 154, 155, 133, 246, 161, 160, 159, 158, 157, 173]),  # eyes
    ([98], [327]),  # nose
]


def mirror(frames: np.ndarray) -> np.ndarray:
    """The same performance by a signer of the opposite handedness."""
    out = frames.copy()
    out[..., 0] = 1 - out[..., 0]
    for left, right in _MIRROR_PAIRS:
        out[:, left], out[:, right] = out[:, right].copy(), out[:, left].copy()
    return out
