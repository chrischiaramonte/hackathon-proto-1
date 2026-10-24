// Loads the legacy MediaPipe Holistic solution once and shares it.
//
// The npm package is a closure-compiled script, not an ES module (bundling it
// breaks in production builds), so we load it with a <script> tag from the
// assets that scripts/copy-mediapipe.mjs copies into public/.
import type { Holistic, Options, Results } from '@mediapipe/holistic';

declare global {
  interface Window {
    Holistic?: typeof Holistic;
  }
}

const BASE = '/mediapipe/holistic/';

// Must match how the model's training data was produced (see backend/app/landmarks.py).
const OPTIONS: Options = {
  modelComplexity: 1,
  smoothLandmarks: true,
  refineFaceLandmarks: false, // the model expects the 468-point face mesh
  enableSegmentation: false,
  // Feed the raw, unmirrored camera image like the training videos. The
  // preview is mirrored with CSS only.
  selfieMode: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

type Listener = (results: Results) => void;

let instance: Promise<Holistic> | null = null;
let listener: Listener | null = null;

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${BASE}holistic.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load MediaPipe Holistic.'));
    document.head.appendChild(script);
  });
}

async function create(): Promise<Holistic> {
  if (!window.Holistic) await loadScript();
  const holistic = new window.Holistic!({ locateFile: (file) => `${BASE}${file}` });
  holistic.setOptions(OPTIONS);
  holistic.onResults((results) => listener?.(results));
  await holistic.initialize();
  return holistic;
}

/**
 * The shared Holistic instance, created on first use. Re-creating the WASM
 * graph is slow and unreliable, so it is never closed; each consumer just
 * replaces the result listener.
 */
export function getHolistic(onResults: Listener): Promise<Holistic> {
  listener = onResults;
  instance ??= create().catch((error: unknown) => {
    instance = null;
    throw error;
  });
  return instance;
}
