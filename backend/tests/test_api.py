import json

import numpy as np

from tests.conftest import load_fixture, to_request_frames


def test_health(client):
    body = client.get("/api/health").json()
    assert body == {"status": "ok", "model": "kaggle-asl-signs-1st-place", "signCount": 250}


def test_signs_lists_the_vocabulary(client):
    signs = client.get("/api/signs").json()["signs"]
    assert len(signs) == 250
    assert {"hello", "thankyou", "mom"} <= set(signs)


def test_recognizes_a_genuine_sign(client):
    response = client.post("/api/recognize", json={"target": "thankyou", "frames": to_request_frames(load_fixture("thankyou"))})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "accepted"
    assert body["accepted"] is True
    assert body["targetRank"] == 1
    assert body["topPredictions"][0]["sign"] == "thankyou"
    probabilities = [p["probability"] for p in body["topPredictions"]]
    assert probabilities == sorted(probabilities, reverse=True) and len(probabilities) == 5
    assert body["framesReceived"] == 48 and 0 < body["framesUsed"] <= 48 and body["handFrames"] > 0


def test_rejects_the_wrong_sign(client):
    body = client.post("/api/recognize", json={"target": "water", "frames": to_request_frames(load_fixture("hello"))}).json()
    assert body["accepted"] is False
    assert body["topPredictions"][0]["sign"] == "hello"


def test_reports_missing_hands_without_scoring(client):
    frames = load_fixture("hello")
    frames[:, 468:489] = np.nan
    frames[:, 522:543] = np.nan
    body = client.post("/api/recognize", json={"target": "hello", "frames": to_request_frames(frames)}).json()
    assert body["status"] == "no_hands"
    assert body["accepted"] is False
    assert body["targetProbability"] is None
    assert body["topPredictions"] == []


def test_unknown_sign_is_rejected(client):
    response = client.post("/api/recognize", json={"target": "notasign", "frames": [{}]})
    assert response.status_code == 422


def test_malformed_landmarks_are_rejected(client):
    hand = [[0.5, 0.5, 0.0]] * 21
    cases = [
        {"target": "hello", "frames": []},  # no frames
        {"target": "hello", "frames": [{"leftHand": hand[:20]}]},  # wrong point count
        {"target": "hello", "frames": [{"rightHand": [[0.5, 0.5]] * 21}]},  # 2-D points
        {"target": "hello", "frames": [{"pose": [[0.5, 0.5, 0.0]] * 32}]},
        {"target": "hello", "frames": [{}] * 385},  # longer than the model reads
    ]
    for body in cases:
        assert client.post("/api/recognize", json=body).status_code == 422, body


def test_non_finite_coordinates_are_rejected(client):
    body = json.dumps({"target": "hello", "frames": [{"leftHand": [[float("nan"), 0.5, 0.0]] * 21}]})
    response = client.post("/api/recognize", content=body, headers={"content-type": "application/json"})
    assert response.status_code == 422
    assert "input" not in response.json()["detail"][0]
