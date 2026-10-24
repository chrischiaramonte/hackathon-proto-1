"""Calibrate the acceptance threshold on labelled clips (<dir>/<sign>/<clip>.npz).

An attempt is accepted when the target is the top prediction and its
probability is at least the threshold. For each candidate threshold:

  correct      clip of sign A, target A                      -> want high
  wrong sign   clip of sign A, target B for every other B    -> want ~0
  nonsense     synthetic movement, every target              -> want ~0

There is no labelled video of "random movement", so nonsense is synthesised
from the real clips:
  reversed   a real sign played backwards
  shuffled   a real sign's frames in random order
  frozen     one frame with a hand, held still (with tracking jitter)
  wander     a real hand pose dragged along a smooth random path

Every sequence goes through recognition.decide(), gates included.

Usage:
    python scripts/calibrate_thresholds.py data/landmarks
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from app.classifier import SignClassifier
from app.landmarks import LEFT_HAND, RIGHT_HAND, present
from app.recognition import decide

THRESHOLDS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7]


def hand_frame(frames: np.ndarray) -> int:
    hands = np.flatnonzero(present(frames, LEFT_HAND) | present(frames, RIGHT_HAND))
    return int(hands[len(hands) // 2])


def frozen(frames: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    held = frames[[hand_frame(frames)]].repeat(45, axis=0)
    return held + rng.normal(0, 0.002, held.shape).astype(np.float32)


def wander(frames: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    base = frames[hand_frame(frames)].copy()
    part = RIGHT_HAND if not np.isnan(base[RIGHT_HAND, 0]).all() else LEFT_HAND
    other = LEFT_HAND if part == RIGHT_HAND else RIGHT_HAND
    base[other] = np.nan
    shape = base[part] - base[part][0]  # hand relative to its wrist
    t = np.linspace(0, 1, 45)[:, None]
    path = np.zeros((45, 2))
    for _ in range(3):  # sum of random sinusoids: a smooth, aimless trajectory
        path += rng.uniform(0.03, 0.12, 2) * np.sin(2 * np.pi * (rng.uniform(0.5, 2, 2) * t + rng.uniform(0, 1, 2)))
    out = base[None].repeat(45, axis=0)
    out[:, part, :2] = shape[None, :, :2] + (base[part][0, :2] + path)[:, None, :]
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("landmarks", type=Path)
    args = parser.parse_args()

    clf = SignClassifier()
    rng = np.random.default_rng(0)
    clips = [(p.parent.name, np.load(p)["frames"]) for p in sorted(args.landmarks.glob("*/*.npz"))]
    signs = sorted({sign for sign, _ in clips})

    def top1(frames: np.ndarray) -> tuple[str, float] | None:
        decision = decide(clf, frames, signs[0])  # top predictions do not depend on the target
        return decision.top_predictions[0] if decision.top_predictions else None

    real = [(sign, top1(frames)) for sign, frames in clips]
    nonsense = {
        "reversed": [(s, top1(f[::-1])) for s, f in clips],
        "shuffled": [(s, top1(f[rng.permutation(len(f))])) for s, f in clips],
        "frozen": [(s, top1(frozen(f, rng))) for s, f in clips],
        "wander": [(s, top1(wander(f, rng))) for s, f in clips],
    }
    kinds = {"correct sign": real, **nonsense}
    n_pairs = len(clips) * (len(signs) - 1)

    def as_source(results, t):  # accepted when the target is the sign it was made from
        return np.mean([r is not None and r[0] == s and r[1] >= t for s, r in results])

    def as_other(results, t):  # accepted for a given *different* target (per target-pair)
        return sum(r is not None and r[0] != s and r[0] in signs and r[1] >= t for s, r in results) / n_pairs

    print(f"{len(clips)} clips of {len(signs)} signs; {len(clips)} synthetic sequences per nonsense kind.")
    print("A = accepted when the target is the sign the sequence came from")
    print("B = accepted when the target is a different sign (false accept, per target pair)\n")
    print(f"{'threshold':>9}" + "".join(f" {k + ' A':>15} {'B':>6}" for k in kinds))
    for t in THRESHOLDS:
        print(f"{t:>9.1f}" + "".join(f" {as_source(r, t):>15.1%} {as_other(r, t):>6.2%}" for r in kinds.values()))
    print()
    for kind, results in nonsense.items():
        gated = sum(r is None for _, r in results)
        print(f"{kind:>9}: {gated} of {len(results)} not scored by the quality gates")


if __name__ == "__main__":
    main()
