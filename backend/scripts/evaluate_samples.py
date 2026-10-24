"""Evaluate the classifier on extracted landmark files (<dir>/<sign>/<clip>.npz).

Reports per-sign top-1 / top-5 accuracy and the probability given to the true
sign, under the variants a live webcam can introduce:

    original   landmarks exactly as extracted
    flipped    x -> 1 - x with left/right hands swapped (a left-handed signer)
    half-fps   every other frame (a browser running MediaPipe at ~15 fps)
    trimmed    only the span in which a hand is visible (tight segmentation)
    padded     1 s of hands-down frames added at both ends (loose segmentation)

Usage:
    python scripts/evaluate_samples.py data/landmarks [--variant original flipped half-fps]
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path

import numpy as np

from app.classifier import SignClassifier
from app.landmarks import LEFT_HAND, RIGHT_HAND, mirror, present


def trim(frames: np.ndarray) -> np.ndarray:
    hands = np.flatnonzero(present(frames, LEFT_HAND) | present(frames, RIGHT_HAND))
    return frames[hands[0] : hands[-1] + 1]


def pad(frames: np.ndarray, n: int = 30) -> np.ndarray:
    idle = frames[[0]].copy()
    idle[:, LEFT_HAND] = np.nan
    idle[:, RIGHT_HAND] = np.nan
    return np.concatenate([idle.repeat(n, axis=0), frames, idle.repeat(n, axis=0)])


VARIANTS = {
    "original": lambda f: f,
    "flipped": mirror,
    "half-fps": lambda f: f[::2],
    "trimmed": trim,
    "padded": pad,
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("landmarks", type=Path)
    parser.add_argument("--variant", nargs="+", default=list(VARIANTS), choices=list(VARIANTS))
    args = parser.parse_args()

    clf = SignClassifier()
    files = sorted(args.landmarks.glob("*/*.npz"))
    for variant in args.variant:
        per_sign: dict[str, list[tuple[int, float, str, float]]] = defaultdict(list)
        for path in files:
            sign = path.parent.name
            frames = VARIANTS[variant](np.load(path)["frames"])
            probs = clf.predict(frames)
            order = np.argsort(-probs)
            rank = int(np.where(order == clf.index[sign])[0][0]) + 1
            per_sign[sign].append((rank, float(probs[clf.index[sign]]), clf.labels[order[0]], float(probs[order[0]])))

        print(f"\n=== {variant}: {len(files)} clips ===")
        print(f"{'sign':<10} {'n':>2} {'top1':>5} {'top5':>5} {'p(true) mean':>12} {'min':>5}  misses (predicted p)")
        ranks, probs_true = [], []
        for sign, rows in sorted(per_sign.items()):
            r = np.array([row[0] for row in rows])
            p = np.array([row[1] for row in rows])
            ranks += list(r)
            probs_true += list(p)
            misses = ", ".join(f"{row[2]} {row[3]:.2f}" for row in rows if row[0] != 1)
            print(f"{sign:<10} {len(rows):>2} {np.mean(r == 1):>5.2f} {np.mean(r <= 5):>5.2f} {p.mean():>12.2f} {p.min():>5.2f}  {misses}")
        ranks, probs_true = np.array(ranks), np.array(probs_true)
        print(f"{'ALL':<10} {len(ranks):>2} {np.mean(ranks == 1):>5.2f} {np.mean(ranks <= 5):>5.2f} {probs_true.mean():>12.2f}")


if __name__ == "__main__":
    main()
