// Copies the MediaPipe Holistic runtime (WASM + models) into public/ so the app
// works offline and does not depend on a CDN during a demo. The legacy
// @mediapipe/holistic package is not an ES module, so it is loaded at runtime
// with a <script> tag from /mediapipe/holistic/ (see src/lib/holistic.ts).
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/@mediapipe/holistic');
const dest = join(root, 'public/mediapipe/holistic');
// modelComplexity 1 only needs pose_landmark_full.tflite.
const skip = new Set(['package.json', 'README.md', 'index.d.ts', 'pose_landmark_heavy.tflite', 'pose_landmark_lite.tflite']);

mkdirSync(dest, { recursive: true });
for (const file of readdirSync(src)) {
  if (!skip.has(file)) copyFileSync(join(src, file), join(dest, file));
}
console.log(`Copied MediaPipe Holistic assets to ${dest}`);
