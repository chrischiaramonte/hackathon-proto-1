import numpy as np

from app.landmarks import FACE, LEFT_HAND, POSE, RIGHT_HAND, ROWS_PER_FRAME, frame_to_rows, mirror, present


def points(n: int, value: float) -> list[list[float]]:
    return [[value, value, value]] * n


def test_parts_land_in_competition_row_order():
    rows = frame_to_rows(points(468, 0.1), points(21, 0.2), points(33, 0.3), points(21, 0.4))
    assert rows.shape == (ROWS_PER_FRAME, 3) == (543, 3)
    assert rows.dtype == np.float32
    np.testing.assert_allclose(rows[0:468], 0.1)
    np.testing.assert_allclose(rows[468:489], 0.2)
    np.testing.assert_allclose(rows[489:522], 0.3)
    np.testing.assert_allclose(rows[522:543], 0.4)


def test_missing_parts_are_nan():
    rows = frame_to_rows(points(468, 0.5), None, None, points(21, 0.5))
    assert np.isnan(rows[LEFT_HAND]).all()
    assert np.isnan(rows[POSE]).all()
    assert not np.isnan(rows[FACE]).any()
    assert not np.isnan(rows[RIGHT_HAND]).any()


def test_present_flags_frames_with_the_part():
    frames = np.stack([frame_to_rows(None, points(21, 0.5), None, None), frame_to_rows(None, None, None, None)])
    assert present(frames, LEFT_HAND).tolist() == [True, False]
    assert present(frames, RIGHT_HAND).tolist() == [False, False]


def test_mirror_swaps_hands_and_flips_x():
    frames = frame_to_rows(None, points(21, 0.2), None, None)[None]
    flipped = mirror(frames)
    assert np.isnan(flipped[0, LEFT_HAND]).all()
    np.testing.assert_allclose(flipped[0, RIGHT_HAND, 0], 0.8)
    np.testing.assert_allclose(flipped[0, RIGHT_HAND, 1], 0.2)
    np.testing.assert_allclose(mirror(flipped), frames, atol=1e-6)
