"""Account, privacy and leaderboard routes, stored in SpacetimeDB (see ../spacetimedb)."""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from app.schemas import CamelModel
from app import spacetime
from app.spacetime import SpacetimeError, SpacetimeUnavailable

log = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/api/account", tags=["accounts"])
CURRICULUM = {
    "first-words": {"hello", "please", "thankyou", "yes", "no", "bye"},
    "family": {"mom", "dad", "grandma", "grandpa", "home"},
    "mealtime": {"food", "drink", "water", "milk", "hungry", "thirsty"},
    "feelings": {"happy", "sad", "sick", "like", "where", "who"},
    "review": {"hello", "please", "thankyou", "yes", "no", "bye", "mom", "dad", "grandma", "grandpa", "home", "food", "drink", "water", "milk", "hungry", "thirsty", "happy", "sad", "sick", "like", "where", "who"},
}
PROFILE = ("id", "displayName", "xp", "leaderboardVisible", "friendsOnly")
ERRORS = {
    "name_taken": (409, "That display name is already taken"),
    "no_match": (404, "No matching learner"),
    "already_friends": (409, "You are already friends"),
    "already_sent": (409, "Friend request already sent"),
    "no_user": (401, "Your session expired. Sign in again"),
}


def _call(procedure: str, *args):
    try:
        return spacetime.call(procedure, *args)
    except SpacetimeError as e:
        if e.code in ERRORS:
            raise HTTPException(*ERRORS[e.code])
        log.error("SpacetimeDB rejected %s: %s", procedure, e.code)
        raise HTTPException(503, "Accounts are unavailable right now")
    except SpacetimeUnavailable as e:
        log.error("SpacetimeDB unavailable: %s", e)
        raise HTTPException(503, "Accounts are unavailable right now")


class Credentials(CamelModel):
    display_name: str = Field(min_length=2, max_length=24, pattern=r"^[\w -]+$")
    password: str = Field(min_length=10, max_length=128)


class PrivacySettings(CamelModel):
    visible: bool
    friends_only: bool = False


class FriendName(CamelModel):
    display_name: str = Field(min_length=2, max_length=24)


class TranslationAnswer(CamelModel):
    lesson_id: str = Field(max_length=40)
    sign: str = Field(max_length=40)
    answer: str = Field(max_length=80)


def _password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return f"{salt.hex()}:{derived.hex()}"


def _valid_password(password: str, stored: str) -> bool:
    salt_hex, expected = stored.split(":", 1)
    return hmac.compare_digest(_password_hash(password, bytes.fromhex(salt_hex)).split(":", 1)[1], expected)


def _session_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user(session: str | None = Cookie(default=None, alias="cosign_session")) -> dict:
    if not session:
        raise HTTPException(401, "Sign in to use accounts")
    profile = spacetime.option(_call("session_user", _session_hash(session)))
    if not profile:
        raise HTTPException(401, "Your session expired. Sign in again")
    return spacetime.record(profile, *PROFILE)


def optional_user(session: str | None = Cookie(default=None, alias="cosign_session")) -> dict | None:
    if not session:
        return None
    try:
        return current_user(session)
    except HTTPException:
        return None


def _set_cookie(response: Response) -> str:
    """Sets a new session cookie and returns the hash to store."""
    token = secrets.token_urlsafe(32)
    response.set_cookie("cosign_session", token, httponly=True, secure=os.getenv("COSIGN_COOKIE_SECURE") == "1", samesite="strict", max_age=30 * 86400, path="/")
    return _session_hash(token)


@router.post("/register")
def register(body: Credentials, response: Response):
    profile = _call("register", body.display_name.strip(), _password_hash(body.password), _set_cookie(response))
    return spacetime.record(profile, *PROFILE)


@router.post("/login")
def login(body: Credentials, response: Response):
    found = spacetime.option(_call("credentials", body.display_name.strip()))
    if not found or not _valid_password(body.password, found[1]):
        raise HTTPException(401, "Display name or password is incorrect")
    return spacetime.record(_call("create_session", found[0], _set_cookie(response)), *PROFILE)


@router.get("/me")
def me(user: dict = Depends(current_user)):
    return user


@router.post("/logout")
def logout(response: Response, session: str | None = Cookie(default=None, alias="cosign_session")):
    if session:
        _call("end_session", _session_hash(session))
    response.delete_cookie("cosign_session", path="/", httponly=True, samesite="strict")
    return {"ok": True}


@router.patch("/privacy")
def privacy(body: PrivacySettings, user: dict = Depends(current_user)):
    return spacetime.record(_call("set_privacy", user["id"], body.visible, body.friends_only), *PROFILE)


@router.delete("")
def delete_account(response: Response, user: dict = Depends(current_user)):
    _call("delete_user", user["id"])
    response.delete_cookie("cosign_session", path="/", httponly=True, samesite="strict")
    return {"ok": True}


@router.get("/leaderboard")
def leaderboard(user: dict = Depends(current_user)):
    return [spacetime.record(row, "rank", "displayName", "xp", "you") for row in _call("leaderboard", user["id"])]


@router.get("/friends")
def friends(user: dict = Depends(current_user)):
    return [spacetime.record(row, "displayName", "accepted", "incoming") for row in _call("friends", user["id"])]


@router.post("/friends/request")
def friend_request(body: FriendName, user: dict = Depends(current_user)):
    _call("request_friend", user["id"], body.display_name.strip())
    return {"ok": True}


@router.delete("/friends/{display_name}")
def unfriend(display_name: str, user: dict = Depends(current_user)):
    _call("remove_friend", user["id"], display_name)
    return {"ok": True}


@router.post("/translation-answer")
def translation_answer(body: TranslationAnswer, user: dict = Depends(current_user)):
    labels = {"hello":"hello", "please":"please", "thankyou":"thank you", "yes":"yes", "no":"no", "bye":"bye", "mom":"mom", "dad":"dad", "grandma":"grandma", "grandpa":"grandpa", "home":"home", "food":"food", "drink":"drink", "water":"water", "milk":"milk", "hungry":"hungry", "thirsty":"thirsty", "happy":"happy", "sad":"sad", "sick":"sick", "like":"like", "where":"where?", "who":"who?"}
    def normalize(value: str) -> str:
        return " ".join("".join(c for c in value.lower().strip() if c not in "?.!,").split())
    if body.sign not in CURRICULUM.get(body.lesson_id, set()) or normalize(body.answer) != normalize(labels.get(body.sign, "")):
        return {"correct": False, "xpAwarded": 0}
    return {"correct": True, "xpAwarded": award_for_accepted_sign(user["id"], body.lesson_id, body.sign)}


def award_for_accepted_sign(user_id: int, lesson_id: str, sign: str) -> int:
    """Server awards only classifier-accepted attempts; repeats pay 10, 5, 2, then 0 (see award_xp)."""
    if sign not in CURRICULUM.get(lesson_id, set()):
        return 0
    try:
        return _call("award_xp", user_id, lesson_id, sign)
    except HTTPException:
        return 0  # A recognition result is still worth returning without XP.
