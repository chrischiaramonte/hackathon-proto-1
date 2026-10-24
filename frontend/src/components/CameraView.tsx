import type { NormalizedLandmarkList, Results } from '@mediapipe/holistic';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CAMERA_ERROR_TEXT, useCamera } from '../hooks/useCamera';
import type { LandmarkFrame } from '../lib/api';
import { framingHint, HINT_TEXT, lightingHint, type FramingHint } from '../lib/framing';
import { getHolistic } from '../lib/holistic';
import { toLandmarkFrame } from '../lib/landmarks';
import { Button } from './Button';
import { IconCamera, IconRefresh } from './Icons';
import styles from './CameraView.module.css';

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
const ARM_CONNECTIONS: [number, number][] = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];
/** A hint must persist this long before it is shown, so it doesn't flicker. */
const HINT_DELAY_MS = 1200;

interface Props {
  /** Forward landmark frames to `onFrame` (tracking and the overlay always run). */
  active: boolean;
  onFrame: (frame: LandmarkFrame, t: number) => void;
  /** The learner chose to continue without a camera. */
  onUseWithoutCamera: () => void;
  /** Camera live and hand tracking loaded: attempts can be checked. */
  onReadyChange: (ready: boolean) => void;
  children?: ReactNode;
}

function drawConnections(
  ctx: CanvasRenderingContext2D,
  points: NormalizedLandmarkList | undefined,
  connections: [number, number][],
  color: string,
  width: number,
) {
  if (!points) return;
  const { width: w, height: h } = ctx.canvas;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [a, b] of connections) {
    const p = points[a];
    const q = points[b];
    if (!p || !q) continue;
    ctx.moveTo(p.x * w, p.y * h);
    ctx.lineTo(q.x * w, q.y * h);
  }
  ctx.stroke();
}

function drawOverlay(canvas: HTMLCanvasElement, results: Results) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scale = canvas.width / 640;
  drawConnections(ctx, results.poseLandmarks, ARM_CONNECTIONS, 'rgba(255,255,255,0.55)', 3 * scale);
  for (const hand of [results.leftHandLandmarks, results.rightHandLandmarks]) {
    drawConnections(ctx, hand, HAND_CONNECTIONS, 'rgba(255,255,255,0.9)', 3 * scale);
    ctx.fillStyle = '#7d6dff';
    for (const p of hand ?? []) {
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, 3.5 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Live, mirrored webcam preview with MediaPipe Holistic tracking. MediaPipe
 * sees the raw (unmirrored) frames, matching the model's training data.
 * Video stays in the browser; only landmark coordinates leave this component.
 */
export function CameraView({ active, onFrame, onUseWithoutCamera, onReadyChange, children }: Props) {
  const { camera, retry } = useCamera();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ active, onFrame });
  const [tracker, setTracker] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hint, setHint] = useState<FramingHint | null>(null);

  useEffect(() => {
    latest.current = { active, onFrame };
  });

  const ready = camera.status === 'live' && tracker === 'ready';
  useEffect(() => onReadyChange(ready), [ready, onReadyChange]);

  useEffect(() => {
    const video = videoRef.current;
    if (camera.status !== 'live' || !video) return;
    video.srcObject = camera.stream;
    video.play().catch(() => {});

    let stopped = false;
    let raf = 0;
    let busy = false;
    let lighting: FramingHint | null = null;
    let lightingCheckedAt = 0;
    let candidate: { hint: FramingHint | null; since: number } = { hint: null, since: 0 };
    let shown: FramingHint | null = null;
    const probe = document.createElement('canvas');
    probe.width = 32;
    probe.height = 18;

    const onResults = (results: Results) => {
      if (stopped) return;
      const canvas = canvasRef.current;
      const now = performance.now();
      if (canvas) {
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
        drawOverlay(canvas, results);
      }
      if (now - lightingCheckedAt > 1000) {
        lightingCheckedAt = now;
        const ctx = probe.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, probe.width, probe.height);
          lighting = lightingHint(ctx.getImageData(0, 0, probe.width, probe.height).data, probe.width, probe.height);
        }
      }
      const frame = toLandmarkFrame(results);
      const next = lighting ?? framingHint(frame);
      if (next !== candidate.hint) candidate = { hint: next, since: now };
      const stable = now - candidate.since >= HINT_DELAY_MS || candidate.hint === null ? candidate.hint : shown;
      if (stable !== shown) {
        shown = stable;
        setHint(stable);
      }
      if (latest.current.active) latest.current.onFrame(frame, now);
    };

    setTracker('loading');
    getHolistic(onResults)
      .then((holistic) => {
        if (stopped) return;
        setTracker('ready');
        const loop = async () => {
          if (stopped) return;
          if (!busy && video.readyState >= 2) {
            busy = true;
            try {
              await holistic.send({ image: video });
            } catch {
              // A dropped frame is harmless; the next one is sent on the next tick.
            }
            busy = false;
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      })
      .catch(() => {
        if (!stopped) setTracker('error');
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [camera]);

  if (camera.status === 'error') {
    return (
      <div className={`${styles.camera} ${styles.placeholder}`} role="alert">
        <IconCamera className={styles.placeholderIcon} />
        <p className={styles.placeholderText}>{CAMERA_ERROR_TEXT[camera.error]}</p>
        <p className={styles.placeholderSub}>
          Without a camera you can still watch every sign and practise along, but attempts can’t be checked and no XP is
          earned.
        </p>
        <div className={styles.placeholderActions}>
          <Button onClick={retry}>
            <IconRefresh /> Try again
          </Button>
          <Button variant="secondary" onClick={onUseWithoutCamera}>
            Practise without camera
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.camera}>
      <video ref={videoRef} className={styles.video} muted playsInline aria-label="Your camera" />
      <canvas ref={canvasRef} className={styles.overlay} aria-hidden="true" />
      {(camera.status === 'starting' || tracker === 'loading') && (
        <div className={styles.loading} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          {camera.status === 'starting' ? 'Starting camera…' : 'Loading hand tracking…'}
        </div>
      )}
      {tracker === 'error' && (
        <div className={styles.loading} role="alert">
          Hand tracking could not be loaded. Refresh the page to try again.
        </div>
      )}
      {hint && tracker === 'ready' && <p className={styles.hint}>{HINT_TEXT[hint]}</p>}
      {children}
    </div>
  );
}
