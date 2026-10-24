"""Run MediaPipe Holistic over sign videos and save model-layout landmark arrays.

Matches the browser pipeline (@mediapipe/holistic): legacy Holistic graph,
model_complexity=1, 468-point face mesh (refine_face_landmarks=False), video
tracking mode, unmirrored frames. Output per video: an .npz with
`frames` (T, 543, 3) float32 (NaN = not detected) and `fps`.

Usage:
    python scripts/extract_landmarks.py data/popsign --out data/landmarks
    python scripts/extract_landmarks.py data/popsign --out data/landmarks_mirrored --mirror
"""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
from mediapipe.python.solutions import holistic as mp_holistic

from app.landmarks import frame_to_rows


def _points(landmark_list) -> list[list[float]] | None:
    if landmark_list is None:
        return None
    return [[lm.x, lm.y, lm.z] for lm in landmark_list.landmark]


def extract(video: Path, mirror: bool = False) -> tuple[np.ndarray, float]:
    cap = cv2.VideoCapture(str(video))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    rows = []
    with mp_holistic.Holistic(
        static_image_mode=False, model_complexity=1, refine_face_landmarks=False
    ) as holistic:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if mirror:
                frame = cv2.flip(frame, 1)
            result = holistic.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            rows.append(
                frame_to_rows(
                    _points(result.face_landmarks),
                    _points(result.left_hand_landmarks),
                    _points(result.pose_landmarks),
                    _points(result.right_hand_landmarks),
                )
            )
    cap.release()
    return np.stack(rows), fps


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("videos", type=Path, help="directory of <sign>/<video>.mp4")
    parser.add_argument("--out", type=Path, default=Path("data/landmarks"))
    parser.add_argument("--mirror", action="store_true", help="flip frames horizontally first")
    args = parser.parse_args()

    for video in sorted(args.videos.glob("*/*.mp4")):
        dest = args.out / video.parent.name / f"{video.stem}.npz"
        if dest.exists():
            continue
        frames, fps = extract(video, mirror=args.mirror)
        dest.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(dest, frames=frames, fps=np.float32(fps))
        print(f"{video.parent.name}/{video.name}: {len(frames)} frames @ {fps:.1f} fps")


if __name__ == "__main__":
    main()
