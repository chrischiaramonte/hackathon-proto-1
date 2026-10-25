"""Account routes against a live SpacetimeDB with the module published (see README)."""
from __future__ import annotations

import secrets

import pytest
from fastapi.testclient import TestClient

from app import spacetime
from app.main import app

try:
    spacetime.call("session_user", "probe")
except spacetime.SpacetimeUnavailable as e:
    pytest.skip(f"SpacetimeDB not available: {e}", allow_module_level=True)

PASSWORD = "correct horse battery"


def learner() -> tuple[TestClient, str]:
    """A fresh signed-in learner; TestClient without `with` skips loading the model."""
    name = f"t{secrets.token_hex(4)}"
    c = TestClient(app)
    assert c.post("/api/account/register", json={"displayName": name, "password": PASSWORD}).status_code == 200
    return c, name


def test_register_login_logout():
    c, name = learner()
    me = c.get("/api/account/me").json()
    assert me["displayName"] == name and me["xp"] == 0 and not me["leaderboardVisible"]
    assert c.post("/api/account/register", json={"displayName": name.upper(), "password": PASSWORD}).status_code == 409

    other = TestClient(app)
    assert other.post("/api/account/login", json={"displayName": name, "password": "wrong password!"}).status_code == 401
    assert other.post("/api/account/login", json={"displayName": name.upper(), "password": PASSWORD}).json()["id"] == me["id"]

    c.post("/api/account/logout")
    assert c.get("/api/account/me").status_code == 401
    assert other.get("/api/account/me").status_code == 200


def test_xp_ladder_and_curriculum():
    c, _ = learner()
    awards = [c.post("/api/account/translation-answer", json={"lessonId": "first-words", "sign": "hello", "answer": "Hello!"}).json()["xpAwarded"] for _ in range(4)]
    assert awards == [10, 5, 2, 0]
    assert c.post("/api/account/translation-answer", json={"lessonId": "family", "sign": "hello", "answer": "hello"}).json() == {"correct": False, "xpAwarded": 0}
    assert c.get("/api/account/me").json()["xp"] == 17


def test_friends_and_leaderboard_visibility():
    a, a_name = learner()
    b, b_name = learner()
    c, _ = learner()
    for client in (a, b, c):
        client.post("/api/account/translation-answer", json={"lessonId": "first-words", "sign": "yes", "answer": "yes"})
    b.patch("/api/account/privacy", json={"visible": True, "friendsOnly": True})

    def names(client):
        return {row["displayName"] for row in client.get("/api/account/leaderboard").json()}

    assert b_name not in names(a)
    # Works regardless of which learner has the lower id.
    assert b.post("/api/account/friends/request", json={"displayName": a_name}).status_code == 200
    assert b.post("/api/account/friends/request", json={"displayName": a_name}).status_code == 409
    assert a.get("/api/account/friends").json() == [{"displayName": b_name, "accepted": False, "incoming": True}]
    assert a.post("/api/account/friends/request", json={"displayName": b_name}).status_code == 200
    assert b.get("/api/account/friends").json() == [{"displayName": a_name, "accepted": True, "incoming": False}]
    assert b_name in names(a) and b_name not in names(c)

    a.delete(f"/api/account/friends/{b_name}")
    assert b_name not in names(a) and b.get("/api/account/friends").json() == []


def test_delete_account_cascades():
    a, a_name = learner()
    b, _ = learner()
    a.post("/api/account/friends/request", json={"displayName": b.get("/api/account/me").json()["displayName"]})
    assert a.delete("/api/account").status_code == 200
    assert a.get("/api/account/me").status_code == 401
    assert b.get("/api/account/friends").json() == []
    assert TestClient(app).post("/api/account/login", json={"displayName": a_name, "password": PASSWORD}).status_code == 401
