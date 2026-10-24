"""The web app's lesson content must only use signs this model can recognise."""

import json
from pathlib import Path

CONTENT = Path(__file__).resolve().parents[2] / "frontend/src/content"
PUBLIC = Path(__file__).resolve().parents[2] / "frontend/public"


def test_lesson_signs_are_in_the_model_vocabulary_and_have_demos(classifier):
    lessons = json.loads((CONTENT / "lessons.json").read_text())
    clips = json.loads((CONTENT / "clips.json").read_text())["clips"]
    for lesson in lessons["lessons"]:
        for sign in lesson["signs"]:
            assert sign in classifier.index, f"{lesson['id']}: '{sign}' is not a model label"
            assert sign in lessons["signs"], f"'{sign}' has no display label"
            assert clips.get(sign), f"'{sign}' has no demonstration clip"
            for clip in clips[sign]:
                assert (PUBLIC / clip["src"].lstrip("/")).is_file(), clip["src"]
