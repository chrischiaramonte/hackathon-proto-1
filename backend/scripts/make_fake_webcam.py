"""Turn PopSign clips into fake-webcam feeds for the browser end-to-end test.

Chrome can replace the webcam with a .y4m file
(--use-file-for-fake-video-capture). For each sign of the chosen lessons this
writes data/fake-webcam/<sign>.y4m: a clip by a signer who is NOT in the demo
clips, letterboxed into a 1280x720 frame like a laptop webcam, with a short rest
pose first. Unmirrored, exactly as a real webcam delivers frames. Y4M is
uncompressed (~100 MB per sign), so only the requested lessons are converted.

Usage (after fetch_popsign_samples.py):
    python scripts/make_fake_webcam.py --lesson first-words --lesson family
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[2]
LESSONS = ROOT / "frontend/src/content/lessons.json"
CLIPS_JSON = ROOT / "frontend/src/content/clips.json"


def signer(filename: str) -> str:
    return filename.split("-", 1)[0]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--videos", type=Path, default=Path("data/popsign"))
    parser.add_argument("--out", type=Path, default=Path("data/fake-webcam"))
    parser.add_argument("--lesson", action="append", help="lesson id (repeatable); default first-words")
    args = parser.parse_args()
    lesson_ids = set(args.lesson or ["first-words"])

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    demo_sources = json.loads(CLIPS_JSON.read_text())["clips"]
    args.out.mkdir(parents=True, exist_ok=True)
    lessons = [lesson for lesson in json.loads(LESSONS.read_text())["lessons"] if lesson["id"] in lesson_ids]
    for sign in sorted({s for lesson in lessons for s in lesson["signs"]}):
        demo_signers = {signer(c["source"]) for c in demo_sources.get(sign, [])}
        candidates = [v for v in sorted((args.videos / sign).glob("*.mp4")) if signer(v.name) not in demo_signers]
        if not candidates:
            print(f"{sign}: no clip by a non-demo signer, skipped")
            continue
        dest = args.out / f"{sign}.y4m"
        subprocess.run(
            [
                ffmpeg, "-y", "-loglevel", "error", "-i", str(candidates[0]),
                "-vf", "tpad=start_duration=0.7:start_mode=clone,scale=-2:720,pad=1280:720:(ow-iw)/2:0:color=0x303040,fps=30",
                "-pix_fmt", "yuv420p", str(dest),
            ],
            check=True,
        )
        print(f"{dest.name}: from {candidates[0].name}")


if __name__ == "__main__":
    main()
