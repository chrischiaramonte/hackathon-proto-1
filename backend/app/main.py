"""FastAPI service: validates landmark sequences and scores sign attempts.

Landmarks are processed in memory and never stored or logged.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.classifier import SignClassifier
from app.accounts import award_for_accepted_sign, optional_user, router as account_router
from app.landmarks import frame_to_rows
from app.recognition import decide
from app.schemas import (
    HealthResponse,
    Prediction,
    RecognizeRequest,
    RecognizeResponse,
    SignsResponse,
)

log = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.classifier = SignClassifier()
    log.info("Loaded sign classifier with %d signs", len(app.state.classifier.labels))
    yield


app = FastAPI(title="ASL sign recognition", lifespan=lifespan)
app.include_router(account_router)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    # The default handler echoes every invalid input back: that fails to encode
    # NaN (turning a 422 into a 500) and would return whole landmark arrays.
    errors = [{"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in exc.errors()[:10]]
    return JSONResponse(status_code=422, content={"detail": errors})


def _classifier(request: Request) -> SignClassifier:
    return request.app.state.classifier


@app.get("/api/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    return HealthResponse(status="ok", model="kaggle-asl-signs-1st-place", sign_count=len(_classifier(request).labels))


@app.get("/api/signs", response_model=SignsResponse)
def signs(request: Request) -> SignsResponse:
    return SignsResponse(signs=_classifier(request).labels)


@app.post("/api/recognize", response_model=RecognizeResponse)
def recognize(body: RecognizeRequest, request: Request) -> RecognizeResponse:
    classifier = _classifier(request)
    if body.target not in classifier.index:
        raise HTTPException(status_code=422, detail=f"unknown sign '{body.target}'; see GET /api/signs")

    frames = np.stack([frame_to_rows(f.face, f.left_hand, f.pose, f.right_hand) for f in body.frames])
    decision = decide(classifier, frames, body.target)
    user = optional_user(request.cookies.get("cosign_session"))
    xp_awarded = award_for_accepted_sign(user["id"], body.lesson_id, body.target) if user and body.lesson_id and decision.status == "accepted" else 0
    log.info(
        "recognize target=%s status=%s p=%s frames=%d",
        body.target,
        decision.status,
        "-" if decision.target_probability is None else f"{decision.target_probability:.2f}",
        len(body.frames),
    )
    return RecognizeResponse(
        target=body.target,
        status=decision.status,
        accepted=decision.status == "accepted",
        target_probability=decision.target_probability,
        target_rank=decision.target_rank,
        top_predictions=[Prediction(sign=s, probability=p) for s, p in decision.top_predictions],
        frames_received=len(body.frames),
        frames_used=decision.frames_used,
        hand_frames=decision.hand_frames,
        xp_awarded=xp_awarded,
    )
