"""HTTP contract between the web app and the recognition service (camelCase JSON)."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.classifier import MAX_FRAMES
from app.landmarks import FACE_POINTS, HAND_POINTS, POSE_POINTS
from app.recognition import Status

Coordinate = Annotated[float, Field(allow_inf_nan=False)]
Point = Annotated[list[Coordinate], Field(min_length=3, max_length=3)]  # MediaPipe [x, y, z]
Face = Annotated[list[Point], Field(min_length=FACE_POINTS, max_length=FACE_POINTS)]
Hand = Annotated[list[Point], Field(min_length=HAND_POINTS, max_length=HAND_POINTS)]
Pose = Annotated[list[Point], Field(min_length=POSE_POINTS, max_length=POSE_POINTS)]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class LandmarkFrame(CamelModel):
    """One MediaPipe Holistic result. `null` means that part was not detected."""

    face: Face | None = None
    left_hand: Hand | None = None
    pose: Pose | None = None
    right_hand: Hand | None = None


class RecognizeRequest(CamelModel):
    target: str = Field(description="sign gloss from GET /api/signs, e.g. 'thankyou'")
    frames: list[LandmarkFrame] = Field(min_length=1, max_length=MAX_FRAMES)


class Prediction(CamelModel):
    sign: str
    probability: float


class RecognizeResponse(CamelModel):
    target: str
    status: Status
    accepted: bool
    target_probability: float | None
    target_rank: int | None
    top_predictions: list[Prediction]
    frames_received: int
    frames_used: int
    hand_frames: int


class SignsResponse(CamelModel):
    signs: list[str]


class HealthResponse(CamelModel):
    status: Literal["ok"]
    model: str
    sign_count: int
