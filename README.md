# SignSpark: learn ASL with your webcam

A Duolingo-style web app for family and friends of Deaf people. Watch a Deaf
signer demonstrate a sign, sign it back to your webcam, and a pretrained
sign-recognition model decides whether it matched. Lessons, XP, retries and
progress are saved in the browser.

Everything below was built to the scope in [DESIGN.md](DESIGN.md). Recognition
is real: no predictions are faked, and every number in this README comes from a
command you can rerun.

**Contents:** [Quick start](#quick-start) · [How it works](#how-it-works) ·
[Recognition pipeline](#recognition-pipeline-and-what-we-verified) ·
[API](#api-contract) · [Testing](#testing) · [Manual webcam checklist](#manual-testing-with-a-real-webcam) ·
[Limitations](#known-limitations) · [Team plan](#suggested-split-for-four-developers) ·
[Credits](#credits-and-licences)

## Quick start

Prerequisites: [uv](https://docs.astral.sh/uv/) (it fetches Python 3.12 if
needed), Node 22.12+ (or 24), and Chrome or Edge (the MediaPipe build we use is most
reliable there).

```bash
# Terminal 1: recognition service on http://127.0.0.1:8000
cd backend
uv sync                                   # FastAPI + LiteRT runtime + pytest
uv run python scripts/download_model.py   # 11 MB model, pinned commit + SHA-256 check
uv run uvicorn app.main:app --port 8000

# Terminal 2: web app on http://localhost:5173
cd frontend
npm install                               # also copies the MediaPipe runtime into public/
npm run dev
```

Open http://localhost:5173, allow the camera, and start **First words**. The
Vite dev server proxies `/api` to the backend, so there is no CORS setup. For a
production build: `npm run build && npm run preview` (same proxy, port 4173).

Demo tips: sit 60–90 cm from the camera with your head and both hands (down to
your waist) in view, face a light, and run the backend on the demo laptop
itself. Recognition never needs the internet; everything, fonts and MediaPipe
included, is served locally.

## How it works

```
 Browser (React + TypeScript, Vite)                     Backend (FastAPI)
 ─────────────────────────────────────                   ───────────────────────────────
 webcam ──► MediaPipe Holistic (WASM, legacy)           POST /api/recognize
            raw unmirrored frames, ~15–30 fps            1. validate shapes (pydantic)
                 │ 468 face + 2×21 hand + 33 pose        2. assemble (T, 543, 3), NaN = missing
                 ▼   landmarks per frame                 3. drop empty frames, trim idle ends
 AttemptSegmenter ── attempt windows (JSON) ──────────►  4. quality gates: hands / face / motion
                                                         5. TFLite model ─► 250 logits ─► softmax
                 ▲                                       6. accept if target is top-1, p ≥ 0.4,
 lesson UI ◄──── status, probability, top-5 ◄─────────      and leads the runner-up by ≥ 0.1
 queue, XP, localStorage
```

The video never leaves the browser; only landmark coordinates are sent, and
the backend neither stores nor logs them.

**Lesson flow** (DESIGN.md §4): each question is *learn* (looping demo by a
real Deaf signer, with slow motion and a second signer) → *practice* (live
camera, 20 s in auto mode) → *feedback*. Accepted signs earn XP; a miss (time
out or Skip) sends the sign to the back of the queue, and the lesson ends only
when every sign has been signed correctly. Then you get a completion screen with
XP, first-try accuracy and per-sign results.

**Game rules** (`frontend/src/lib/lessonEngine.ts`): +10 XP first try, +5 after
a miss, +20 the first time a lesson is completed. Replaying a completed lesson
earns half and no bonus, so the easiest lesson can't be farmed. **Review**
unlocks after 3 learned signs and mixes up to 6 of them.

**Persistence** (`frontend/src/lib/progress.ts`): XP, completed lessons,
learned signs and the in-progress lesson are kept in `localStorage`. Every
answer is saved immediately, so a refresh or closed tab resumes on the same
sign. Corrupt or outdated data falls back safely.

**When things go wrong:**

| Situation | Behaviour |
| --- | --- |
| Camera blocked / missing / in use / unplugged | Specific explanation and Retry. "Practice without camera" runs the lesson unscored (no XP, no completion). Scored practice can't start without a working camera, and an unplugged camera returns to the demo without a miss. |
| Backend unreachable | Banner, Retry and "Practice without scoring"; the start button is disabled while it's down. Progress is never lost. |
| No hands, face out of view, hand held still | Not scored. The learner is told what to fix (`no_hands`, `no_face`, `no_motion`). |
| Dark room, bright window behind you, too close or far, hands leaving the frame | Live coaching hints over the camera. |
| Near-tie between similar signs | Not accepted until the model clearly prefers the target. |

## Repository layout

```
backend/
  app/landmarks.py      543-row frame layout (face | left hand | pose | right hand)
  app/classifier.py     TFLite inference only: empty-frame filter, softmax, labels
  app/recognition.py    acceptance policy: trimming, quality gates, thresholds
  app/schemas.py        HTTP contract (pydantic, camelCase JSON)
  app/main.py           FastAPI routes
  scripts/              model download, PopSign fetch, landmark extraction,
                        evaluation, calibration, live replay, demo clips, fake webcams
  tests/                pytest, incl. real PopSign landmark fixtures
frontend/
  src/content/          lessons.json (hand-written), clips.json (generated)
  src/lib/              pure logic: api, lessonEngine, progress, segmenter, framing, landmarks, holistic
  src/hooks/            useCamera, useRecognizer
  src/components/       CameraView, SignDemo, FeedbackSheet, ModelGuesses, Button, …
  src/screens/          Dashboard, LessonScreen, CompleteScreen
  public/signs/         46 demo clips (PopSign, CC BY 4.0, ~4 MB)
  e2e/                  browser end-to-end test with a fake webcam
```

## Recognition pipeline and what we verified

**Model.** [`sign/kaggle-asl-signs-1st-place`](https://huggingface.co/sign/kaggle-asl-signs-1st-place)
(MIT), the winning ensemble of Google's *Isolated Sign Language Recognition*
Kaggle competition. Verified by reading the [original training code](https://github.com/hoyso48/Google---Isolated-Sign-Language-Recognition-1st-place-solution)
and probing the model file:

- Input `(T, 543, 3)` float32 (any T), MediaPipe Holistic landmarks in the
  competition's row order: face 0–467, left hand 468–488, pose 489–521, right
  hand 522–542. Missing parts are NaN.
- Output: 250 **logits** (not probabilities). Labels from
  `sign_to_prediction_index_map.json`.
- Normalisation happens inside the graph: it centres on lip landmark 17,
  divides by the per-axis std, keeps x/y only, sets NaN to 0, and reads at most
  384 frames. Pose rows and z are ignored, and webcam aspect ratio cancels out
  (verified numerically).
- Training dropped frames with no landmarks, but the graph doesn't, and such
  frames change the logits. **The backend drops them** (`classifier.py`).
- The training videos are unmirrored phone selfies, so the browser feeds
  MediaPipe raw camera frames (`selfieMode: false`) and mirrors only the preview.
- Face mesh must be the 468-point version (`refineFaceLandmarks: false`).

**Ground truth.** The competition data was extracted from
[PopSign ASL v1.0](https://signdata.cc.gatech.edu/view/datasets/popsign_v1_0/)
(Deaf signers, CC BY 4.0). `scripts/fetch_popsign_samples.py` pulls individual
test-split videos with HTTP range requests. We ran MediaPipe Holistic (Python;
the same legacy Holistic solution and settings as the browser) on **168 clips of 28 signs from
4–8 signers each**:

| Variant (`scripts/evaluate_samples.py`) | Top-1 | Top-5 | mean p(true sign) |
| --- | --- | --- | --- |
| As recorded | **97%** | 99% | 0.83 |
| Mirrored, as if signed left-handed | 96% | 99% | 0.83 |
| Every other frame (~15 fps browser) | 95% | 99% | 0.81 |
| Trimmed to the hand-visible span | 98% | 100% | 0.86 |
| 1 s of idle frames added each side | 96% | 99% | 0.73 |
| Landmarks from horizontally flipped video | 98% | 99% | 0.83 |

So the layout, label mapping and preprocessing are right, and left-handed
signing and a slow browser frame rate are fine. Because idle frames hurt
confidence, the backend trims hands-down frames at both ends. The misses are
plausible confusions (dad→man, mom→grandma, sleep→sleepy, brother→gift); those
weaker signs were kept out of the lessons except the family signs, which still
score well.

**Acceptance rule** (`app/recognition.py`, calibrated with
`scripts/calibrate_thresholds.py`). Accept when the target is the top
prediction with p ≥ 0.4 and a lead of ≥ 0.1 over the runner-up. Quality gates
refuse to score attempts without hands, without a face, or with a hand held
still. At p ≥ 0.4, 95.8% of genuine single clips pass, and a clip of a
different sign is accepted for a given wrong target 0.02% of the time.
Synthetic nonsense scored against a *different* target: shuffled frames 0.02%,
a hand wandering randomly 0.07%, frozen hands 0% (motion gate), reversed signs
0.37%.

**Live behaviour** (`scripts/simulate_live.py`) replays the exact auto-mode
segmenter timing over all 168 clips and scores every window:

| Frame rate | Accepted on one pass of the sign | False accept per wrong target |
| --- | --- | --- |
| ~30 fps | **96.4%** | 0.022% (1 of 4,536) |
| ~15 fps | **93.5%** | 0% |

**In the real browser** (`npm run e2e`): headless Chrome's fake webcam played
PopSign videos by signers who do *not* appear in the demo clips, through the
real MediaPipe JS → API → model path.
- 11 different signs across *First words* and *Family* were accepted, at p 0.41–0.98, 1–4 s after pressing "I'm ready".
- Showing HELLO while the lesson asked for PLEASE: 14 of 14 windows were rejected (p = 0.00), then "Time's up" and requeue.
- The margin rule held back MOM vs GRANDMA (0.22 vs 0.20) until a clear MOM (0.41 vs 0.15).

**What a probability is not:** the model ranks 250 signs. It cannot grade
handshape, location or movement separately, and it weighs handshape and
location more than movement *direction* (a sign played backwards often still
matches). The UI therefore says "the model is N% sure" and shows its top
guesses, never a quality grade.

## API contract

`POST /api/recognize` (see `backend/app/schemas.py`; FastAPI docs at
http://127.0.0.1:8000/docs)

```jsonc
// request: 1–384 frames, each part null when MediaPipe didn't detect it
{
  "target": "thankyou",                       // a gloss from GET /api/signs
  "frames": [
    { "face": [[x, y, z], ...468], "leftHand": null, "pose": [[x, y, z], ...33], "rightHand": [[x, y, z], ...21] }
  ]
}
// response
{
  "target": "thankyou",
  "status": "accepted",                       // accepted | close | rejected | no_hands | no_face | no_motion
  "accepted": true,
  "targetProbability": 0.86,                  // null when not scored
  "targetRank": 1,
  "topPredictions": [{ "sign": "thankyou", "probability": 0.86 }, "...4 more"],
  "framesReceived": 14, "framesUsed": 6, "handFrames": 6
}
```

Also `GET /api/health` and `GET /api/signs` (the 250 glosses). Malformed input,
including NaN coordinates, gets a 422 that never echoes landmark data back.

## Testing

| Command | What it covers | Result |
| --- | --- | --- |
| `cd backend && uv run pytest` | Layout; model output; **real PopSign fixtures predicted and accepted**, also mirrored; wrong signs rejected; gates; trimming; margin rule; API contract and validation; lesson content only uses model labels and has clips on disk | 44 passed |
| `cd frontend && npm test` | Lesson queue, requeue and XP rules; persistence, corruption and storage failures; segmenter timing; API client errors and timeouts; landmark conversion; framing and lighting hints; content integrity | 39 passed |
| `cd frontend && npm run typecheck && npm run build` | Strict TypeScript, production build | OK |
| `cd frontend && npm run e2e` | Real browser, real MediaPipe, real model: accept, reject and requeue, resume after reload, full lesson completion with 75 XP, camera denied, server down | 5 of 5 passed |

The end-to-end test and the evaluation scripts need the optional data tooling:

```bash
cd backend
uv sync --extra validation   # mediapipe 0.10.21 (last with legacy Holistic), opencv, ffmpeg
uv run python scripts/fetch_popsign_samples.py hello please thankyou yes no bye --per-sign 6
uv run python scripts/extract_landmarks.py data/popsign          # then evaluate_samples.py etc.
uv run python scripts/make_fake_webcam.py                         # data/fake-webcam/*.y4m for npm run e2e
```

`make_demo_clips.py` regenerates `frontend/public/signs` and `clips.json` for
whatever is in `lessons.json` (it needs the clips fetched and extracted first).
To add a lesson: put signs that `evaluate_samples.py` shows are reliable in
`lessons.json`, add labels, run `make_demo_clips.py`, and run both test suites.

## Manual testing with a real webcam

A fake webcam proves the pipeline, but only real people prove the product.
Before the demo, have each teammate run this in Chrome:

1. Start both servers. Open the app, allow the camera, and start **First words**. The live view should show white hand skeletons on your hands.
2. **Hello:** watch the demo, press *I'm ready*, sign HELLO. Expect "Nice signing!" within ~1–3 s and +10 XP.
3. **Negative:** on *Please*, sign HELLO or wave randomly for 20 s. It must not pass. After "Time's up", Please moves to the end.
4. Hold one hand still in view: "Show the whole movement". Drop your hands: no scoring. Step out of frame or cover your face: framing hints.
5. Dim the lights or sit with a window behind you: lighting hint.
6. Sign with your **other** hand: it should still be accepted.
7. Refresh mid-lesson: the dashboard shows *Pick up where you left off* and resumes on the same sign.
8. Stop the backend: banner and disabled start. Restart it and press Retry.
9. Block the camera in site settings: explanation, then practice without camera (no XP).
10. Finish the lesson: completion screen and XP on the dashboard. Replay it: half XP, no bonus.
11. Note any sign that keeps failing for a teammate who is signing it like the demo. That's our real-world accuracy data.

Not verifiable without real people and cameras: beginner (non-fluent) signing
accuracy, real webcam frame rates (headless Chrome managed ~15–22 fps),
lighting and skin-tone robustness (MediaPipe's job), two people in frame, and
switching cameras.

## Known limitations

- **Calibration is on Deaf signers' PopSign clips.** Hearing beginners will
  score lower; tune thresholds with consented webcam recordings (see team plan).
  Some PopSign clips may also have been in the model's training data, so
  offline accuracy is optimistic. The browser runs used non-demo signers.
- **No component-level feedback** (handshape, location, movement). The model
  can't provide it; DESIGN.md lists it as a non-goal. We show top guesses instead.
- **Movement direction is weakly checked:** a sign done backwards may pass. The
  motion gate rules out frozen hands.
- **Two people in frame:** Holistic tracks one person and we can't choose
  which. No camera picker yet; an unplugged camera recovers via Retry.
- **Partial-sign windows:** the start of one sign can look like another (PLEASE
  opens like HUNGRY). The 0.9 s first-check delay and margin rule mitigate it.
- **No dispute button, streaks, accounts or cross-device sync** (DESIGN.md
  non-goals or later tests). *Reset progress* clears local data.
- No text descriptions of signs: we only show authentic demonstrations rather
  than writing unreviewed instructions. A Deaf reviewer sign-off is still
  needed before anything goes public (DESIGN.md §13.6).
- Desktop Chrome/Edge are the tested browsers. The legacy MediaPipe build is
  heavy on phones; mobile layout works but wasn't tested on devices.
- Setup gotchas: `frontend/.npmrc` sets `legacy-peer-deps` because npm 11
  crashes on an optional peer cycle in Vite 8. Intel Macs have no LiteRT wheel
  (use Linux, Windows or Apple Silicon). python.org Python on macOS lacks CA
  certs; the scripts use `/etc/ssl/cert.pem` (override with `SSL_CERT_FILE`).

## Suggested split for four developers

Module boundaries were chosen so these can proceed in parallel with few conflicts:

1. **ML and backend** (`backend/`). Record consented webcam attempts from
   teammates and friends (landmarks only, via the same API), then recalibrate
   with `calibrate_thresholds.py` and `simulate_live.py`. Try per-sign
   thresholds and confusion-aware hints ("looks like MY: add the circular
   motion"). Validate more of the 250 signs to grow the curriculum.
2. **Camera and recognition UX** (`CameraView`, `useRecognizer`, `segmenter.ts`).
   Camera picker and device-change handling, a "two people" warning from pose,
   an fps readout with adaptive model complexity, MediaPipe in a Web Worker.
   Keep `simulate_live.py` in sync with segmenter constants.
3. **Game and lessons** (`lessonEngine.ts`, `progress.ts`, screens). Streaks
   and daily goal, hearts, spaced-repetition review, a "dispute this result"
   flag that's saved without changing the score, onboarding with a camera
   pre-check.
4. **Content, accessibility and demo** (`content/`, CSS, README). Deaf reviewer
   sign-off on labels and clips, screen-reader and keyboard audit, mobile
   polish, more lessons via `make_demo_clips.py`, demo script and recording,
   single-host deployment (serve `frontend/dist` behind the API).

## Credits and licences

- Sign demonstration clips and validation data: **PopSign ASL v1.0**, Thad
  Starner et al., Georgia Institute of Technology and Deaf Professional Arts
  Network, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Clips
  were trimmed to the sign, scaled to 360×640 and re-encoded; each clip's
  source file is listed in `frontend/src/content/clips.json`. Credited in the app footer.
- Recognition model: [kaggle-asl-signs-1st-place](https://huggingface.co/sign/kaggle-asl-signs-1st-place)
  by Hoyeol Sohn, MIT.
- Landmarks: [MediaPipe Holistic](https://github.com/google/mediapipe), Apache-2.0.
- Font: Nunito, SIL Open Font License.
