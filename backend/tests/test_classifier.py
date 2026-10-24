import numpy as np
import pytest

from app.classifier import drop_empty_frames
from tests.conftest import FIXTURE_SIGNS, load_fixture


def test_labels_follow_the_competition_index(classifier):
    assert len(classifier.labels) == 250
    assert classifier.labels[0] == "TV"
    assert classifier.labels[249] == "zipper"
    assert all(classifier.labels[i] == sign for sign, i in classifier.index.items())


def test_outputs_a_probability_distribution(classifier):
    probs = classifier.predict(load_fixture("hello"))
    assert probs.shape == (250,)
    assert (probs >= 0).all()
    assert probs.sum() == pytest.approx(1.0)


@pytest.mark.parametrize("sign", FIXTURE_SIGNS)
def test_genuine_signs_are_the_top_prediction(classifier, sign):
    probs = classifier.predict(load_fixture(sign))
    assert classifier.labels[int(probs.argmax())] == sign


def test_same_attempt_gives_the_same_result(classifier):
    frames = load_fixture("thankyou")
    np.testing.assert_array_equal(classifier.predict(frames), classifier.predict(frames.copy()))


def test_empty_frames_do_not_change_the_prediction(classifier):
    frames = load_fixture("mom")
    empty = np.full((10, 543, 3), np.nan, dtype=np.float32)
    padded = np.concatenate([empty, frames, empty])
    assert len(drop_empty_frames(padded)) == len(drop_empty_frames(frames))
    np.testing.assert_allclose(classifier.predict(padded), classifier.predict(frames), atol=1e-6)


def test_refuses_input_without_any_landmarks(classifier):
    with pytest.raises(ValueError):
        classifier.predict(np.full((5, 543, 3), np.nan, dtype=np.float32))
