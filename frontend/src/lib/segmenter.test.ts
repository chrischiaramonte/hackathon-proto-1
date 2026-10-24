import { describe, expect, it } from 'vitest';
import type { LandmarkFrame, Point } from './api';
import { AttemptSegmenter, SEGMENTER_DEFAULTS } from './segmenter';

const hand: Point[] = Array.from({ length: 21 }, () => [0.5, 0.5, 0]);
const withHands = (id: number): LandmarkFrame => ({ face: [[id, 0, 0]], leftHand: null, pose: null, rightHand: hand });
const noHands = (id: number): LandmarkFrame => ({ face: [[id, 0, 0]], leftHand: null, pose: null, rightHand: null });
const frameId = (f: LandmarkFrame) => f.face![0]![0];

/** Feeds frames at 30 fps; `hands(t)` decides whether a hand is visible at time t (ms). */
function run(durationMs: number, hands: (t: number) => boolean) {
  const segmenter = new AttemptSegmenter();
  const segments = [];
  for (let i = 0, t = 0; t <= durationMs; i++, t = (i * 1000) / 30) {
    const segment = segmenter.push(hands(t) ? withHands(i) : noHands(i), t);
    if (segment) segments.push({ ...segment, t, ids: segment.frames.map(frameId) });
  }
  return segments;
}

describe('attempt segmenter', () => {
  it('emits nothing while no hand is visible', () => {
    expect(run(5000, () => false)).toEqual([]);
  });

  it('emits a final attempt, with pre-roll, once the hands go down', () => {
    // Hands up from 1.0 s to 2.0 s.
    const segments = run(4000, (t) => t >= 1000 && t < 2000);
    const final = segments.filter((s) => s.final);
    expect(final).toHaveLength(1);
    const [attempt] = final;
    // Ends ~endGapMs after the hands disappear.
    expect(attempt!.t).toBeGreaterThanOrEqual(2000 + SEGMENTER_DEFAULTS.endGapMs - 34);
    expect(attempt!.t).toBeLessThan(2000 + SEGMENTER_DEFAULTS.endGapMs + 34);
    // Starts ~preRollMs before the hands appeared (frame 30 is t = 1000 ms).
    const firstId = attempt!.ids[0]!;
    expect(firstId).toBeLessThan(30);
    expect(firstId).toBeGreaterThanOrEqual(30 - (SEGMENTER_DEFAULTS.preRollMs / 1000) * 30 - 1);
  });

  it('checks windows periodically while the hands stay up', () => {
    const segments = run(6000, (t) => t >= 500);
    const windows = segments.filter((s) => !s.final);
    expect(windows.length).toBeGreaterThanOrEqual(5);
    const gaps = windows.slice(1).map((w, i) => w.t - windows[i]!.t);
    gaps.forEach((gap) => expect(gap).toBeGreaterThanOrEqual(SEGMENTER_DEFAULTS.strideMs - 1));
    // No window is longer than windowMs.
    windows.forEach((w) => expect(w.frames.length).toBeLessThanOrEqual((SEGMENTER_DEFAULTS.windowMs / 1000) * 30 + 2));
    // The first check waits for minMs of signing.
    expect(windows[0]!.t - 500).toBeGreaterThanOrEqual(SEGMENTER_DEFAULTS.minMs - 34);
  });

  it('tolerates brief tracking dropouts within an attempt', () => {
    // Hand lost for 200 ms in the middle: still one attempt.
    const segments = run(4000, (t) => (t >= 1000 && t < 1500) || (t >= 1700 && t < 2200));
    expect(segments.filter((s) => s.final)).toHaveLength(1);
  });

  it('starts over after reset', () => {
    const segmenter = new AttemptSegmenter();
    segmenter.push(withHands(0), 0);
    expect(segmenter.signing).toBe(true);
    segmenter.reset();
    expect(segmenter.signing).toBe(false);
    expect(segmenter.push(noHands(1), 2000)).toBeNull();
  });
});
