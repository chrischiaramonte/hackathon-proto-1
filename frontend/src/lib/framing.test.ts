import { describe, expect, it } from 'vitest';
import type { LandmarkFrame, Point } from './api';
import { framingHint, lightingHint } from './framing';

function face(width: number): Point[] {
  return Array.from({ length: 468 }, (_, i) => [0.5 - width / 2 + (width * i) / 467, 0.4, 0]);
}
const hand = (x: number): Point[] => Array.from({ length: 21 }, () => [x, 0.6, 0]);
const frame = (parts: Partial<LandmarkFrame>): LandmarkFrame => ({ face: null, leftHand: null, pose: null, rightHand: null, ...parts });

describe('framing hints', () => {
  it('is quiet when the signer is well framed', () => {
    expect(framingHint(frame({ face: face(0.2), rightHand: hand(0.4) }))).toBeNull();
  });

  it('asks for the face, distance and hands in frame', () => {
    expect(framingHint(frame({}))).toBe('no-face');
    expect(framingHint(frame({ face: face(0.05) }))).toBe('too-far');
    expect(framingHint(frame({ face: face(0.5) }))).toBe('too-close');
    expect(framingHint(frame({ face: face(0.2), leftHand: hand(1.04) }))).toBe('hands-cut-off');
  });
});

function image(width: number, height: number, luma: (x: number, y: number) => number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = luma(x, y) * 255;
      pixels.set([v, v, v, 255], (y * width + x) * 4);
    }
  }
  return pixels;
}

describe('lighting hints', () => {
  it('flags a dark room', () => {
    expect(lightingHint(image(32, 18, () => 0.08), 32, 18)).toBe('dark');
  });

  it('flags a bright window behind a dark signer', () => {
    const backlit = (x: number, y: number) => (Math.abs(x - 16) < 8 && Math.abs(y - 9) < 4.5 ? 0.25 : 0.95);
    expect(lightingHint(image(32, 18, backlit), 32, 18)).toBe('backlit');
  });

  it('accepts ordinary lighting', () => {
    expect(lightingHint(image(32, 18, () => 0.5), 32, 18)).toBeNull();
  });
});
