import type { NormalizedLandmarkList, Results } from '@mediapipe/holistic';
import type { LandmarkFrame, Point } from './api';

// 4 decimals (1e-4 of the image) is far below MediaPipe's own jitter. On the
// PopSign validation clips it moved no prediction by more than 0.002.
const round = (v: number) => Math.round(v * 1e4) / 1e4;

function points(list: NormalizedLandmarkList | undefined): Point[] | null {
  return list ? list.map((p) => [round(p.x), round(p.y), round(p.z)]) : null;
}

export function toLandmarkFrame(results: Results): LandmarkFrame {
  return {
    face: points(results.faceLandmarks),
    leftHand: points(results.leftHandLandmarks),
    pose: points(results.poseLandmarks),
    rightHand: points(results.rightHandLandmarks),
  };
}

export function hasHands(frame: LandmarkFrame): boolean {
  return frame.leftHand !== null || frame.rightHand !== null;
}
