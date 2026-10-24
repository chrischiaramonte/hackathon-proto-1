"""Cut the lesson demonstration clips from PopSign videos.

For every sign in frontend/src/content/lessons.json, takes the PopSign clips
the model scores most confidently (one per signer), trims them to the signing
(hand-visible span plus a short margin), scales to 360x640 and encodes small
H.264 MP4s into frontend/public/signs/. Writes frontend/src/content/clips.json
with the attribution for every clip.

PopSign ASL v1.0 is CC BY 4.0, so the clips may be redistributed with credit
and a note that they were modified (trimmed, scaled, re-encoded).

Usage (after fetch_popsign_samples.py and extract_landmarks.py):
    python scripts/make_demo_clips.py --per-sign 2
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import imageio_ffmpeg
import numpy as np

from app.classifier import SignClassifier
from app.landmarks import LEFT_HAND, RIGHT_HAND, present

ROOT = Path(__file__).resolve().parents[2]
LESSONS = ROOT / "frontend/src/content/lessons.json"
CLIPS_JSON = ROOT / "frontend/src/content/clips.json"
OUT_DIR = ROOT / "frontend/public/signs"
MARGIN_S = 0.3

ATTRIBUTION = {
    "dataset": "PopSign ASL v1.0",
    "creators": "Thad Starner et al., Georgia Institute of Technology and Deaf Professional Arts Network",
    "url": "https://signdata.cc.gatech.edu/view/datasets/popsign_v1_0/",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "changes": "Trimmed to the sign, scaled to 360x640, re-encoded.",
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--per-sign", type=int, default=2)
    parser.add_argument("--videos", type=Path, default=Path("data/popsign"))
    parser.add_argument("--landmarks", type=Path, default=Path("data/landmarks"))
    args = parser.parse_args()

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    clf = SignClassifier()
    signs = sorted({s for lesson in json.loads(LESSONS.read_text())["lessons"] for s in lesson["signs"]})
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, list[dict[str, str]]] = {}

    for sign in signs:
        ranked = []
        for path in sorted((args.landmarks / sign).glob("*.npz")):
            data = np.load(path)
            frames, fps = data["frames"], float(data["fps"])
            prob = float(clf.predict(frames)[clf.index[sign]])
            ranked.append((prob, path.stem, frames, fps))
        ranked.sort(key=lambda r: -r[0])

        manifest[sign] = []
        for n, (prob, stem, frames, fps) in enumerate(ranked[: args.per_sign], start=1):
            hands = np.flatnonzero(present(frames, LEFT_HAND) | present(frames, RIGHT_HAND))
            start = max(0.0, hands[0] / fps - MARGIN_S)
            end = min(len(frames) / fps, (hands[-1] + 1) / fps + MARGIN_S)
            dest = OUT_DIR / f"{sign}-{n}.mp4"
            subprocess.run(
                [
                    ffmpeg, "-y", "-loglevel", "error",
                    "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", str(args.videos / sign / f"{stem}.mp4"),
                    "-vf", "scale=360:640:flags=lanczos", "-an",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart", str(dest),
                ],
                check=True,
            )
            manifest[sign].append({"src": f"/signs/{dest.name}", "source": f"{stem}.mp4"})
            print(f"{dest.name}: {end - start:.1f}s, p={prob:.2f}, {dest.stat().st_size // 1024} KB")

    CLIPS_JSON.write_text(json.dumps({"attribution": ATTRIBUTION, "clips": manifest}, indent=2) + "\n")


if __name__ == "__main__":
    main()
