"""Minimal HTTP client for the SignSpark SpacetimeDB module (../spacetimedb).

SpacetimeDB has no Python SDK, so procedures are called over its HTTP API.
Results come back in SATS JSON: objects as positional arrays, options as
[0, value] (some) or [1, []] (none).
"""
from __future__ import annotations

import json
import os
import tomllib
import urllib.error
import urllib.request
from pathlib import Path

STDB_URL = os.getenv("SIGNSPARK_STDB_URL", "https://maincloud.spacetimedb.com")
STDB_DB = os.getenv("SIGNSPARK_STDB_DB", "calhack-r0hwe")


class SpacetimeError(Exception):
    """A procedure rejected the call; `code` is the module's SenderError message."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class SpacetimeUnavailable(Exception):
    """The database could not be reached or failed unexpectedly."""


def _token() -> str:
    # The module's admin is its publisher, so locally the CLI's own token works.
    if token := os.getenv("SIGNSPARK_STDB_TOKEN"):
        return token
    try:
        return tomllib.loads((Path.home() / ".config/spacetime/cli.toml").read_text())["spacetimedb_token"]
    except (OSError, KeyError, tomllib.TOMLDecodeError):
        raise SpacetimeUnavailable("Set SIGNSPARK_STDB_TOKEN or run `spacetime login`")


def call(procedure: str, *args):
    request = urllib.request.Request(
        f"{STDB_URL}/v1/database/{STDB_DB}/call/{procedure}",
        data=json.dumps(list(args)).encode(),
        headers={"Authorization": f"Bearer {_token()}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read() or b"null")
    except urllib.error.HTTPError as e:
        message = e.read().decode(errors="replace")
        # SenderError("code") arrives as a 500 whose body ends with ": code".
        code = message.rsplit(": ", 1)[-1]
        if e.code == 500 and code.isidentifier():
            raise SpacetimeError(code) from None
        raise SpacetimeUnavailable(f"{procedure}: HTTP {e.code} {message[:200]}") from None
    except (urllib.error.URLError, TimeoutError) as e:
        raise SpacetimeUnavailable(f"{procedure}: {e}") from None


def record(values: list, *fields: str) -> dict:
    return dict(zip(fields, values))


def option(value: list):
    return value[1] if value[0] == 0 else None
