import numpy as np
import pytest

from app.landmarks import FACE, LEFT_HAND, RIGHT_HAND, mirror, present
from app.recognition import ACCEPT_PROBABILITY, decide, judge, prepare
from tests.conftest import FIXTURE_SIGNS, load_fixture


@pytest.mark.parametrize("sign", FIXTURE_SIGNS)
def test_genuine_sign_is_accepted(classifier, sign):
    decision = decide(classifier, load_fixture(sign), sign)
    assert decision.status == "accepted"
    assert decision.target_rank == 1
    assert decision.target_probability >= ACCEPT_PROBABILITY
    assert [s for s, _ in decision.top_predictions][0] == sign


@pytest.mark.parametrize("sign", FIXTURE_SIGNS)
def test_left_handed_version_is_accepted(classifier, sign):
    assert decide(classifier, mirror(load_fixture(sign)), sign).status == "accepted"


@pytest.mark.parametrize(("performed", "target"), [("hello", "thankyou"), ("mom", "water"), ("yes", "please")])
def test_a_different_sign_is_not_accepted(classifier, performed, target):
    decision = decide(classifier, load_fixture(performed), target)
    assert decision.status in ("rejected", "close")
    assert decision.target_rank > 1


def test_no_hands_is_not_scored(classifier):
    frames = load_fixture("hello")
    frames[:, LEFT_HAND] = np.nan
    frames[:, RIGHT_HAND] = np.nan
    assert decide(classifier, frames, "hello").status == "no_hands"


def test_no_face_is_not_scored(classifier):
    frames = load_fixture("hello")
    frames[:, FACE] = np.nan
    assert decide(classifier, frames, "hello").status == "no_face"


def test_hand_held_still_is_not_scored(classifier):
    frames = load_fixture("water")
    hands = np.flatnonzero(present(frames, LEFT_HAND) | present(frames, RIGHT_HAND))
    still = frames[[hands[len(hands) // 2]]].repeat(40, axis=0)
    assert decide(classifier, still, "water").status == "no_motion"


def test_idle_frames_around_an_attempt_are_trimmed(classifier):
    frames = load_fixture("please")
    idle = frames[[0]].copy()
    idle[:, LEFT_HAND] = np.nan
    idle[:, RIGHT_HAND] = np.nan
    padded = np.concatenate([idle.repeat(30, axis=0), frames, idle.repeat(30, axis=0)])
    assert len(prepare(padded)) == len(prepare(frames))
    assert decide(classifier, padded, "please") == decide(classifier, frames, "please")


def probs(*top: float) -> np.ndarray:
    """A 250-way distribution whose first entries are `top`, the rest sharing what's left."""
    out = np.full(250, (1 - sum(top)) / (250 - len(top)))
    out[: len(top)] = top
    return out


def test_judge_needs_a_clear_top_prediction():
    assert judge(probs(0.6, 0.2), 0) == ("accepted", 1)
    assert judge(probs(0.42, 0.40), 0) == ("close", 1)  # near-tie between similar signs
    assert judge(probs(0.35, 0.1), 0) == ("close", 1)  # top, but not confident enough
    assert judge(probs(0.5, 0.3), 1) == ("close", 2)
    assert judge(probs(0.5, 0.3, 0.1, 0.05), 3) == ("rejected", 4)
    assert judge(probs(0.9, 0.05, 0.02), 2) == ("rejected", 3)  # top 3 but negligible
