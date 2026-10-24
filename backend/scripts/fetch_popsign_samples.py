"""Download a few PopSign ASL v1.0 videos per sign, without fetching whole archives.

PopSign ASL v1.0 (Georgia Tech / DPAN, CC BY 4.0) is the dataset the Kaggle
"ASL Signs" competition data was extracted from, so its videos are the closest
thing to ground truth for validating our landmark pipeline end to end.

The dataset ships one ~600 MB tar per sign and split. Tar members are laid out
sequentially (512-byte header, then data padded to 512 bytes), so we walk the
headers with HTTP range requests and download only the members we want.

Usage:
    python scripts/fetch_popsign_samples.py hello thankyou --per-sign 6 --split test
"""

from __future__ import annotations

import argparse
import http.client
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlsplit

from _https import SSL_CONTEXT

BASE_URL = "https://signdata.cc.gatech.edu/data/popsign_v1_0/game"
BLOCK = 512

# One keep-alive connection per thread: walking ~150 tar headers otherwise
# spends most of its time on TLS handshakes.
_local = threading.local()


def fetch_range(url: str, start: int, length: int) -> bytes:
    parts = urlsplit(url)
    headers = {"Range": f"bytes={start}-{start + length - 1}"}
    for attempt in range(3):
        conn = getattr(_local, "conn", None)
        if conn is None:
            conn = _local.conn = http.client.HTTPSConnection(parts.netloc, timeout=60, context=SSL_CONTEXT)
        try:
            conn.request("GET", parts.path, headers=headers)
            resp = conn.getresponse()
            body = resp.read()
        except (http.client.HTTPException, OSError):
            conn.close()
            _local.conn = None
            if attempt == 2:
                raise
            continue
        if resp.status != 206:
            raise RuntimeError(f"server ignored range request for {url} (HTTP {resp.status})")
        return body
    raise AssertionError("unreachable")


def parse_octal(field: bytes) -> int:
    field = field.split(b"\0", 1)[0].strip()
    return int(field, 8) if field else 0


def list_members(url: str) -> list[tuple[str, int, int]]:
    """Return (name, data_offset, size) for every regular file in a remote tar."""
    members: list[tuple[str, int, int]] = []
    offset = 0
    long_name: str | None = None
    while True:
        header = fetch_range(url, offset, BLOCK)
        if len(header) < BLOCK or header == b"\0" * BLOCK:
            break
        size = parse_octal(header[124:136])
        typeflag = header[156:157]
        data_offset = offset + BLOCK
        if typeflag == b"L":  # GNU long name: the name is the member's data
            long_name = fetch_range(url, data_offset, size).split(b"\0", 1)[0].decode()
        elif typeflag == b"x":  # pax header: may carry the real path
            pax = fetch_range(url, data_offset, size).decode(errors="replace")
            match = re.search(r"\d+ path=(.*)\n", pax)
            long_name = match.group(1) if match else long_name
        elif typeflag in (b"0", b"\0"):
            prefix = header[345:500].split(b"\0", 1)[0].decode()
            name = header[0:100].split(b"\0", 1)[0].decode()
            full = long_name or (f"{prefix}/{name}" if prefix else name)
            members.append((full, data_offset, size))
            long_name = None
        offset = data_offset + -(-size // BLOCK) * BLOCK
    return members


def signer_id(filename: str, sign: str) -> str:
    # e.g. "gtsignstudy4a.8031-hello-2023_01_24_20_27_17.907-0.mp4" -> "gtsignstudy4a.8031"
    return Path(filename).name.split(f"-{sign}-", 1)[0]


def fetch_sign(sign: str, split: str, per_sign: int, out_dir: Path) -> list[Path]:
    url = f"{BASE_URL}/{split}/{sign}.tar"
    members = [m for m in list_members(url) if m[0].endswith(".mp4")]
    # Round-robin across signers so samples cover as many people as possible.
    by_signer: dict[str, list[tuple[str, int, int]]] = {}
    for member in members:
        by_signer.setdefault(signer_id(member[0], sign), []).append(member)
    picked: list[tuple[str, int, int]] = []
    queues = [list(v) for v in by_signer.values()]
    while len(picked) < per_sign and any(queues):
        for queue in queues:
            if queue and len(picked) < per_sign:
                picked.append(queue.pop(len(queue) // 2))

    saved = []
    sign_dir = out_dir / sign
    sign_dir.mkdir(parents=True, exist_ok=True)
    for name, data_offset, size in picked:
        dest = sign_dir / Path(name).name
        if not dest.exists() or dest.stat().st_size != size:
            dest.write_bytes(fetch_range(url, data_offset, size))
        saved.append(dest)
    print(f"{sign}: {len(members)} videos from {len(by_signer)} signers in {split}; saved {len(saved)}")
    return saved


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("signs", nargs="+", help="sign glosses as used by the model, e.g. hello thankyou")
    parser.add_argument("--split", default="test", choices=["train", "val", "test"])
    parser.add_argument("--per-sign", type=int, default=6)
    parser.add_argument("--out", type=Path, default=Path("data/popsign"))
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(lambda s: fetch_sign(s, args.split, args.per_sign, args.out), args.signs))


if __name__ == "__main__":
    main()
