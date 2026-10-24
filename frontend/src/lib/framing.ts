// Live coaching about camera setup, computed from landmarks and pixel
// brightness. These never affect scoring; the backend has its own gates.
import type { LandmarkFrame, Point } from './api';

export type FramingHint = 'no-face' | 'too-far' | 'too-close' | 'hands-cut-off' | 'dark' | 'backlit';

export const HINT_TEXT: Record<FramingHint, string> = {
  'no-face': 'Center your face in the camera. Signs are read relative to your face.',
  'too-far': 'Move a little closer to the camera.',
  'too-close': 'Move back so your hands fit in the frame.',
  'hands-cut-off': 'Keep your hands inside the frame.',
  dark: 'It’s quite dark. Add some light in front of you.',
  backlit: 'There’s bright light behind you. Try facing the light instead.',
};

const outside = ([x, y]: Point) => x < 0 || x > 1 || y < 0 || y > 1;

export function framingHint(frame: LandmarkFrame): FramingHint | null {
  if (!frame.face) return 'no-face';
  const xs = frame.face.map((p) => p[0]);
  const faceWidth = Math.max(...xs) - Math.min(...xs);
  if (faceWidth > 0.4) return 'too-close';
  if (faceWidth < 0.08) return 'too-far';
  // MediaPipe extrapolates landmarks beyond the image when a hand is cut off.
  if ([frame.leftHand, frame.rightHand].some((hand) => hand?.some(outside))) return 'hands-cut-off';
  return null;
}

/**
 * Lighting check on a small RGBA snapshot of the camera frame: too dark
 * overall, or a dark centre (the signer) against a bright surround (a window).
 */
export function lightingHint(pixels: Uint8ClampedArray, width: number, height: number): FramingHint | null {
  let all = 0;
  let centre = 0;
  let centreCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const luma = (0.2126 * pixels[i]! + 0.7152 * pixels[i + 1]! + 0.0722 * pixels[i + 2]!) / 255;
      all += luma;
      if (Math.abs(x - width / 2) < width / 4 && Math.abs(y - height / 2) < height / 4) {
        centre += luma;
        centreCount++;
      }
    }
  }
  const mean = all / (width * height);
  const centreMean = centre / centreCount;
  const surround = (all - centre) / (width * height - centreCount);
  if (mean < 0.18) return 'dark';
  if (surround > 0.6 && centreMean < surround * 0.55) return 'backlit';
  return null;
}
