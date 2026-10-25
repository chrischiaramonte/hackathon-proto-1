"""Small SQLite account, privacy and leaderboard store for the prototype."""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from collections.abc import Iterator

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from app.schemas import CamelModel

DB_PATH = Path(os.getenv("SIGNSPARK_DB", Path(__file__).parents[1] / "data" / "signspark.sqlite3"))
router = APIRouter(prefix="/api/account", tags=["accounts"])
CURRICULUM = {
    "first-words": {"hello", "please", "thankyou", "yes", "no", "bye"},
    "family": {"mom", "dad", "grandma", "grandpa", "home"},
    "mealtime": {"food", "drink", "water", "milk", "hungry", "thirsty"},
    "feelings": {"happy", "sad", "sick", "like", "where", "who"},
    "review": {"hello", "please", "thankyou", "yes", "no", "bye", "mom", "dad", "grandma", "grandpa", "home", "food", "drink", "water", "milk", "hungry", "thirsty", "happy", "sad", "sick", "like", "where", "who"},
}


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    try:
        with db:
            yield db
    finally:
        db.close()


def init_db() -> None:
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY, display_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
          password_hash TEXT NOT NULL, leaderboard_visible INTEGER NOT NULL DEFAULT 0,
          friends_only INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS xp_events (
          id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          lesson_id TEXT NOT NULL, sign TEXT NOT NULL, award_index INTEGER NOT NULL, points INTEGER NOT NULL,
          created_at TEXT NOT NULL, UNIQUE(user_id, lesson_id, sign, award_index)
        );
        CREATE TABLE IF NOT EXISTS friend_requests (
          sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          accepted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
          PRIMARY KEY(sender_id, receiver_id), CHECK(sender_id != receiver_id)
        );
        CREATE INDEX IF NOT EXISTS xp_events_user_idx ON xp_events(user_id);
        """)


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


def current_user(session: str | None = Cookie(default=None, alias="signspark_session")) -> sqlite3.Row:
    if not session:
        raise HTTPException(401, "Sign in to use accounts")
    now = datetime.now(timezone.utc).isoformat()
    with connect() as db:
        row = db.execute("SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?", (_session_hash(session), now)).fetchone()
    if not row:
        raise HTTPException(401, "Your session expired. Sign in again")
    return row


def optional_user(session: str | None = Cookie(default=None, alias="signspark_session")) -> sqlite3.Row | None:
    if not session:
        return None
    try:
        return current_user(session)
    except HTTPException:
        return None


def _issue_session(user_id: int, response: Response) -> None:
    token = secrets.token_urlsafe(32)
    expiry = datetime.now(timezone.utc) + timedelta(days=30)
    with connect() as db:
        db.execute("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)", (_session_hash(token), user_id, expiry.isoformat()))
    response.set_cookie("signspark_session", token, httponly=True, secure=os.getenv("SIGNSPARK_COOKIE_SECURE") == "1", samesite="strict", max_age=30 * 86400, path="/")


def _profile(db: sqlite3.Connection, user_id: int) -> dict:
    row = db.execute("SELECT id,display_name,leaderboard_visible,friends_only,(SELECT COALESCE(SUM(points),0) FROM xp_events WHERE user_id=users.id) AS xp FROM users WHERE id=?", (user_id,)).fetchone()
    return {"id": row["id"], "displayName": row["display_name"], "xp": row["xp"], "leaderboardVisible": bool(row["leaderboard_visible"]), "friendsOnly": bool(row["friends_only"])}


@router.post("/register")
def register(body: Credentials, response: Response):
    init_db()
    try:
        with connect() as db:
            cur = db.execute("INSERT INTO users(display_name,password_hash,created_at) VALUES(?,?,?)", (body.display_name.strip(), _password_hash(body.password), datetime.now(timezone.utc).isoformat()))
            user_id = cur.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(409, "That display name is already taken")
    _issue_session(user_id, response)
    with connect() as db:
        return _profile(db, user_id)


@router.post("/login")
def login(body: Credentials, response: Response):
    with connect() as db:
        row = db.execute("SELECT * FROM users WHERE display_name=? COLLATE NOCASE", (body.display_name.strip(),)).fetchone()
    if not row or not _valid_password(body.password, row["password_hash"]):
        raise HTTPException(401, "Display name or password is incorrect")
    _issue_session(row["id"], response)
    with connect() as db:
        return _profile(db, row["id"])


@router.get("/me")
def me(user: sqlite3.Row = Depends(current_user)):
    with connect() as db:
        return _profile(db, user["id"])


@router.post("/logout")
def logout(response: Response, session: str | None = Cookie(default=None, alias="signspark_session")):
    if session:
        with connect() as db:
            db.execute("DELETE FROM sessions WHERE token_hash=?", (_session_hash(session),))
    response.delete_cookie("signspark_session", path="/", httponly=True, samesite="strict")
    return {"ok": True}


@router.patch("/privacy")
def privacy(body: PrivacySettings, user: sqlite3.Row = Depends(current_user)):
    with connect() as db:
        db.execute("UPDATE users SET leaderboard_visible=?,friends_only=? WHERE id=?", (body.visible, body.friends_only if body.visible else False, user["id"]))
        return _profile(db, user["id"])


@router.delete("")
def delete_account(response: Response, user: sqlite3.Row = Depends(current_user)):
    with connect() as db:
        db.execute("DELETE FROM users WHERE id=?", (user["id"],))
    response.delete_cookie("signspark_session", path="/", httponly=True, samesite="strict")
    return {"ok": True}


@router.get("/leaderboard")
def leaderboard(user: sqlite3.Row = Depends(current_user)):
    with connect() as db:
        rows = db.execute("""SELECT u.id,u.display_name,COALESCE(SUM(e.points),0) xp
            FROM users u LEFT JOIN xp_events e ON e.user_id=u.id
            WHERE u.leaderboard_visible=1 AND (u.id=? OR u.friends_only=0 OR EXISTS (
              SELECT 1 FROM friend_requests f WHERE f.accepted=1 AND
                ((f.sender_id=u.id AND f.receiver_id=?) OR (f.receiver_id=u.id AND f.sender_id=?))))
            GROUP BY u.id ORDER BY xp DESC,u.display_name COLLATE NOCASE LIMIT 100""", (user["id"], user["id"], user["id"])).fetchall()
        return [{"rank": i + 1, "displayName": r["display_name"], "xp": r["xp"], "you": r["id"] == user["id"]} for i, r in enumerate(rows)]


@router.get("/friends")
def friends(user: sqlite3.Row = Depends(current_user)):
    with connect() as db:
        rows = db.execute("""SELECT u.display_name,f.sender_id,f.receiver_id,f.accepted
          FROM friend_requests f JOIN users u ON u.id=CASE WHEN f.sender_id=? THEN f.receiver_id ELSE f.sender_id END
          WHERE f.sender_id=? OR f.receiver_id=? ORDER BY f.accepted,u.display_name""", (user["id"], user["id"], user["id"])).fetchall()
        return [{"displayName": r["display_name"], "accepted": bool(r["accepted"]), "incoming": r["receiver_id"] == user["id"] and not r["accepted"]} for r in rows]


@router.post("/friends/request")
def friend_request(body: FriendName, user: sqlite3.Row = Depends(current_user)):
    with connect() as db:
        friend = db.execute("SELECT id FROM users WHERE display_name=? COLLATE NOCASE", (body.display_name.strip(),)).fetchone()
        if not friend or friend["id"] == user["id"]:
            raise HTTPException(404, "No matching learner")
        a, b = sorted((user["id"], friend["id"]))
        existing = db.execute("SELECT sender_id,receiver_id,accepted FROM friend_requests WHERE sender_id=? AND receiver_id=?", (a, b)).fetchone()
        if existing and existing["accepted"]:
            raise HTTPException(409, "You are already friends")
        if existing:
            if existing["sender_id"] == user["id"]:
                raise HTTPException(409, "Friend request already sent")
            db.execute("UPDATE friend_requests SET accepted=1 WHERE sender_id=? AND receiver_id=?", (a, b))
        else:
            db.execute("INSERT INTO friend_requests(sender_id,receiver_id,created_at) VALUES(?,?,?)", (user["id"], friend["id"], datetime.now(timezone.utc).isoformat()))
    return {"ok": True}


@router.delete("/friends/{display_name}")
def unfriend(display_name: str, user: sqlite3.Row = Depends(current_user)):
    with connect() as db:
        friend = db.execute("SELECT id FROM users WHERE display_name=? COLLATE NOCASE", (display_name,)).fetchone()
        if friend:
            a, b = sorted((user["id"], friend["id"]))
            db.execute("DELETE FROM friend_requests WHERE sender_id=? AND receiver_id=?", (a, b))
    return {"ok": True}


@router.post("/translation-answer")
def translation_answer(body: TranslationAnswer, user: sqlite3.Row = Depends(current_user)):
    labels = {"hello":"hello", "please":"please", "thankyou":"thank you", "yes":"yes", "no":"no", "bye":"bye", "mom":"mom", "dad":"dad", "grandma":"grandma", "grandpa":"grandpa", "home":"home", "food":"food", "drink":"drink", "water":"water", "milk":"milk", "hungry":"hungry", "thirsty":"thirsty", "happy":"happy", "sad":"sad", "sick":"sick", "like":"like", "where":"where?", "who":"who?"}
    def normalize(value: str) -> str:
        return " ".join("".join(c for c in value.lower().strip() if c not in "?.!,").split())
    if body.sign not in CURRICULUM.get(body.lesson_id, set()) or normalize(body.answer) != normalize(labels.get(body.sign, "")):
        return {"correct": False, "xpAwarded": 0}
    return {"correct": True, "xpAwarded": award_for_accepted_sign(user["id"], body.lesson_id, body.sign)}


def award_for_accepted_sign(user_id: int, lesson_id: str, sign: str) -> int:
    """Server awards only classifier-accepted attempts; repeats pay 10, 5, 2, then 0."""
    if sign not in CURRICULUM.get(lesson_id, set()):
        return 0
    with connect() as db:
        previous = db.execute("SELECT COUNT(*) n FROM xp_events WHERE user_id=? AND lesson_id=? AND sign=?", (user_id, lesson_id, sign)).fetchone()["n"]
        points = (10, 5, 2)[previous] if previous < 3 else 0
        if points:
            db.execute("INSERT INTO xp_events(user_id,lesson_id,sign,award_index,points,created_at) VALUES(?,?,?,?,?,?)", (user_id, lesson_id, sign, previous, points, datetime.now(timezone.utc).isoformat()))
        return points
