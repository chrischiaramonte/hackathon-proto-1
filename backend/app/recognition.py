"""Acceptance rules: turn classifier scores into a pass/fail for one attempt.

This is application policy, separate from the model. The classifier only ranks
250 signs; it cannot say whether a sign was performed well, so we accept an
attempt only when the target is the model's clear first choice, and we refuse
to score attempts whose input the model would not have seen in training.
Thresholds are calibrated in scripts/calibrate_thresholds.py and
scripts/simulate_live.py.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

from app.classifier import SignClassifier, drop_empty_frames
from app.landmarks import FACE, LEFT_HAND, RIGHT_HAND, present

# Calibrated on 168 PopSign test clips of 28 signs (8 signers per sign at most);
# see scripts/calibrate_thresholds.py for the full table.

# Quality gates: the attempt is not scored and the user is told what to fix.
MIN_HAND_FRAMES = 5  # genuine clips have >= 11 at 30 fps and >= 4 at 15 fps
MIN_FACE_FRACTION = 0.5  # the model centres on the lips; genuine clips have >= 0.875
MIN_HAND_MOTION = 0.04  # in face widths: genuine signs >= 0.079, a hand held still <= 0.012

# Accept when the target is the top prediction with at least this probability
# and a clear lead over the runner-up. At 0.4: 95.8% of genuine clips accepted;
# a clip of another sign is accepted for a given wrong target 0.02% of the time.
# The margin costs no genuine acceptances in the live replay and holds back
# near-ties between similar signs (PLEASE 0.42 vs MY 0.40 was seen in testing).
ACCEPT_PROBABILITY = 0.4
MIN_MARGIN = 0.1
CLOSE_PROBABILITY = 0.1  # target in the top 3 with at least this: "close, try again"
TOP_K = 5

Status = Literal["accepted", "close", "rejected", "no_hands", "no_face", "no_motion"]


@dataclass(frozen=True)
class Decision:
    status: Status
    target_probability: float | None
    target_rank: int | None
    top_predictions: list[tuple[str, float]]
    frames_used: int
    hand_frames: int


def prepare(frames: np.ndarray) -> np.ndarray:
    """Drop empty frames, then trim hands-down frames at both ends.

    On PopSign clips, trimming to the hand-visible span raised mean p(true)
    from 0.83 to 0.86, while 1 s of idle padding dropped it to 0.73
    (scripts/evaluate_samples.py --variant trimmed padded). Trimming here makes
    the result independent of how loosely the client segments an attempt.
    """
    frames = drop_empty_frames(frames)
    hands = np.flatnonzero(present(frames, LEFT_HAND) | present(frames, RIGHT_HAND))
    if len(hands) == 0:
        return frames[:0]
    return frames[hands[0] : hands[-1] + 1]


def hand_motion(frames: np.ndarray) -> float:
    """How much the more active hand moved, in face widths.

    The mean over its 21 landmarks of each landmark's spread over time, so
    finger movement counts as well as arm movement.
    """
    faces = frames[present(frames, FACE)][:, FACE, 0]
    if len(faces) == 0:
        return 0.0
    face_width = float(np.median(faces.max(axis=1) - faces.min(axis=1)))
    motion = 0.0
    for part in (LEFT_HAND, RIGHT_HAND):
        hand = frames[present(frames, part)][:, part, :2]
        if len(hand) >= 2:
            motion = max(motion, float(np.linalg.norm(hand.std(axis=0), axis=-1).mean()) / face_width)
    return motion


def judge(probs: np.ndarray, target_index: int) -> tuple[Status, int]:
    """Status and rank (1 = top prediction) of the target in a probability vector."""
    order = np.argsort(-probs)
    rank = int(np.flatnonzero(order == target_index)[0]) + 1
    p = float(probs[target_index])
    if rank == 1 and p >= ACCEPT_PROBABILITY and p - float(probs[order[1]]) >= MIN_MARGIN:
        return "accepted", rank
    if rank <= 3 and p >= CLOSE_PROBABILITY:
        return "close", rank
    return "rejected", rank


def decide(classifier: SignClassifier, frames: np.ndarray, target: str) -> Decision:
    frames = prepare(frames)
    hand_frames = int((present(frames, LEFT_HAND) | present(frames, RIGHT_HAND)).sum())
    if hand_frames < MIN_HAND_FRAMES:
        return Decision("no_hands", None, None, [], len(frames), hand_frames)
    if present(frames, FACE).mean() < MIN_FACE_FRACTION:
        return Decision("no_face", None, None, [], len(frames), hand_frames)
    if hand_motion(frames) < MIN_HAND_MOTION:
        return Decision("no_motion", None, None, [], len(frames), hand_frames)

    probs = classifier.predict(frames)
    status, rank = judge(probs, classifier.index[target])
    order = np.argsort(-probs)
    return Decision(
        status=status,
        target_probability=float(probs[classifier.index[target]]),
        target_rank=rank,
        top_predictions=[(classifier.labels[i], float(probs[i])) for i in order[:TOP_K]],
        frames_used=len(frames),
        hand_frames=hand_frames,
    )
