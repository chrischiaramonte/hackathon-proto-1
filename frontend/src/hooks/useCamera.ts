import { useCallback, useEffect, useState } from 'react';

export type CameraError = 'denied' | 'not-found' | 'in-use' | 'insecure' | 'ended' | 'unknown';

export type CameraState =
  | { status: 'starting' }
  | { status: 'live'; stream: MediaStream }
  | { status: 'error'; error: CameraError };

export const CAMERA_ERROR_TEXT: Record<CameraError, string> = {
  denied: 'Camera access was blocked. Allow the camera for this site in your browser’s address bar, then try again.',
  'not-found': 'No camera was found. Connect a webcam and try again.',
  'in-use': 'The camera is being used by another app. Close it (Zoom, FaceTime, …) and try again.',
  insecure: 'The camera only works on https:// or http://localhost. Open the app from localhost.',
  ended: 'The camera was disconnected. Reconnect it and try again.',
  unknown: 'The camera could not be started.',
};

function toCameraError(error: unknown): CameraError {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'not-found';
  if (name === 'NotReadableError' || name === 'AbortError') return 'in-use';
  return 'unknown';
}

/** Opens the front camera while mounted. Video only; nothing is recorded or uploaded. */
export function useCamera(): { camera: CameraState; retry: () => void } {
  const [camera, setCamera] = useState<CameraState>({ status: 'starting' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCamera({ status: 'error', error: 'insecure' });
      return;
    }
    let stream: MediaStream | null = null;
    let cancelled = false;
    setCamera({ status: 'starting' });
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = s;
        s.getVideoTracks()[0]?.addEventListener('ended', () => setCamera({ status: 'error', error: 'ended' }));
        setCamera({ status: 'live', stream: s });
      })
      .catch((error: unknown) => {
        if (!cancelled) setCamera({ status: 'error', error: toCameraError(error) });
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { camera, retry };
}
