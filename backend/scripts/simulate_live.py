"""Replay auto-mode recognition over labelled clips (<dir>/<sign>/<clip>.npz).

Feeds each clip through a copy of the web app's AttemptSegmenter
(frontend/src/lib/segmenter.ts; keep the timing constants in sync), scores
every window with recognition.decide() exactly as POST /api/recognize does, and
reports, per frame rate:

  accepted      share of clips accepted when the target is the true sign
  false accept  share of (clip, other target) pairs accepted for the wrong sign

Use it to check segmenter or threshold changes before trying them live.

Usage:
    python scripts/simulate_live.py data/landmarks
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from app.classifier import SignClassifier
from app.landmarks import LEFT_HAND, RIGHT_HAND, present
from app.recognition import decide

# frontend/src/lib/segmenter.ts SEGMENTER_DEFAULTS (ms)
PRE_ROLL, END_GAP, STRIDE, WINDOW, MIN_SIGNING = 300, 500, 800, 2500, 900


def windows(frames: np.ndarray, fps: float) -> list[np.ndarray]:
    hands = present(frames, LEFT_HAND) | present(frames, RIGHT_HAND)
    idle = frames[0].copy()
    idle[LEFT_HAND] = np.nan
    idle[RIGHT_HAND] = np.nan
    # Append 1 s of hands-down frames so the attempt ends as it would live.
    stream = list(zip(frames, hands)) + [(idle, False)] * int(fps)
    buffer: list[tuple[float, np.ndarray]] = []
    out: list[np.ndarray] = []
    active, start, last_hand, last_emit = False, 0.0, 0.0, 0.0
    for i, (frame, hand) in enumerate(stream):
        t = i * 1000 / fps
        buffer.append((t, frame))
        if not active:
            buffer = [b for b in buffer if b[0] >= t - PRE_ROLL]
            if hand:
                active, start, last_hand, last_emit = True, t, t, t
            continue
        if hand:
            last_hand = t
        if t - last_hand >= END_GAP:
            out.append(np.stack([f for _, f in buffer]))
            buffer, active = [], False
            continue
        buffer = [b for b in buffer if b[0] >= t - WINDOW]
        if t - start >= MIN_SIGNING and t - last_emit >= STRIDE:
            last_emit = t
            out.append(np.stack([f for _, f in buffer]))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("landmarks", type=Path)
    args = parser.parse_args()

    clf = SignClassifier()
    clips = [(p.parent.name, np.load(p)) for p in sorted(args.landmarks.glob("*/*.npz"))]
    signs = sorted({sign for sign, _ in clips})
    for step, label in [(1, "~30 fps (as recorded)"), (2, "~15 fps (slow browser)")]:
        accepted, false_accepts, n_windows = 0, 0, 0
        for sign, data in clips:
            accepted_as: set[str] = set()
            for window in windows(data["frames"][::step], float(data["fps"]) / step):
                n_windows += 1
                top = decide(clf, window, sign).top_predictions
                if not top:
                    continue
                # A window is accepted for whichever target passes the rule; only the
                # top prediction can, so checking it as the target is enough.
                if decide(clf, window, top[0][0]).status == "accepted":
                    accepted_as.add(top[0][0])
            accepted += sign in accepted_as
            false_accepts += len(accepted_as & (set(signs) - {sign}))
        pairs = len(clips) * (len(signs) - 1)
        print(
            f"{label}: {len(clips)} clips, {n_windows / len(clips):.1f} windows per clip | "
            f"accepted {accepted / len(clips):.1%} | false accept {false_accepts / pairs:.3%} ({false_accepts} of {pairs} pairs)"
        )


if __name__ == "__main__":
    main()
