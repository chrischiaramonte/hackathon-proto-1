import type { Results } from '@mediapipe/holistic';
import { describe, expect, it } from 'vitest';
import { hasHands, toLandmarkFrame } from './landmarks';

const points = (n: number) => Array.from({ length: n }, (_, i) => ({ x: 0.123456 + i, y: 0.5, z: -0.0000449 }));

describe('MediaPipe results to API frames', () => {
  it('keeps all four parts, rounded to 4 decimals', () => {
    const results = {
      faceLandmarks: points(468),
      poseLandmarks: points(33),
      leftHandLandmarks: points(21),
      rightHandLandmarks: points(21),
    } as unknown as Results;
    const frame = toLandmarkFrame(results);
    expect(frame.face).toHaveLength(468);
    expect(frame.pose).toHaveLength(33);
    expect(frame.leftHand).toHaveLength(21);
    expect(frame.rightHand![0]).toEqual([0.1235, 0.5, -0]);
  });

  it('marks undetected parts as null', () => {
    const frame = toLandmarkFrame({ faceLandmarks: points(468) } as unknown as Results);
    expect(frame.leftHand).toBeNull();
    expect(frame.rightHand).toBeNull();
    expect(frame.pose).toBeNull();
    expect(hasHands(frame)).toBe(false);
    expect(hasHands({ ...frame, leftHand: [[0, 0, 0]] })).toBe(true);
  });
});
