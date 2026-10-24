import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, recognize, type LandmarkFrame, type RecognitionResult } from '../lib/api';
import { AttemptSegmenter, type Segment } from '../lib/segmenter';

export type CaptureMode = 'auto' | 'manual';

/** Manual recordings stop by themselves after this long. */
export const MAX_RECORDING_MS = 5000;

interface Options {
  target: string | undefined;
  lessonId?: string;
  /** Frames are ignored unless enabled (e.g. outside the practice phase). */
  enabled: boolean;
  mode: CaptureMode;
  onAccepted: (result: RecognitionResult) => void;
}

export interface Recognizer {
  pushFrame: (frame: LandmarkFrame, t: number) => void;
  /** A hand is up and an attempt is being collected (auto mode). */
  signing: boolean;
  checking: boolean;
  recording: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  /** The last finished attempt that was not accepted. */
  lastResult: RecognitionResult | null;
  /** Finished attempts the model scored and rejected (quality-gated ones don't count). */
  misses: number;
  error: ApiError | null;
}

/**
 * Sends sign attempts to the recognition server and reports the outcome.
 *
 * Auto mode segments the live landmark stream (see AttemptSegmenter); manual
 * mode records between startRecording() and stopRecording(). One request is
 * in flight at a time; a window that is not accepted is silent, so the user
 * is never told "wrong" while still mid-sign.
 */
export function useRecognizer({ target, lessonId, enabled, mode, onAccepted }: Options): Recognizer {
  const segmenter = useRef(new AttemptSegmenter());
  const generation = useRef(0);
  const inFlight = useRef(false);
  const queued = useRef<Segment | null>(null);
  const recordingRef = useRef<{ frames: LandmarkFrame[]; startT: number } | null>(null);
  const signingRef = useRef(false);
  const latest = useRef({ target, lessonId, enabled, mode, onAccepted });

  const [signing, setSigning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [lastResult, setLastResult] = useState<RecognitionResult | null>(null);
  const [misses, setMisses] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    latest.current = { target, lessonId, enabled, mode, onAccepted };
  });

  // New sign, mode or phase: start clean and ignore answers still in flight.
  useEffect(() => {
    generation.current += 1;
    segmenter.current.reset();
    queued.current = null;
    recordingRef.current = null;
    signingRef.current = false;
    setSigning(false);
    setRecording(false);
    setLastResult(null);
    setMisses(0);
    setError(null);
  }, [target, lessonId, enabled, mode]);

  const submit = useCallback((segment: Segment) => {
    const sign = latest.current.target;
    if (!sign) return;
    if (inFlight.current) {
      // Keep only the newest segment, but never drop a finished attempt for a window.
      if (!queued.current?.final || segment.final) queued.current = segment;
      return;
    }
    inFlight.current = true;
    setChecking(true);
    const gen = generation.current;
    recognize(sign, segment.frames, latest.current.lessonId)
      .then((result) => {
        if (gen !== generation.current) return;
        setError(null);
        if (result.accepted) {
          latest.current.onAccepted(result);
        } else if (segment.final) {
          setLastResult(result);
          if (result.status === 'rejected' || result.status === 'close') setMisses((n) => n + 1);
        }
      })
      .catch((err: unknown) => {
        if (gen === generation.current) setError(err instanceof ApiError ? err : new ApiError(String(err), 'network'));
      })
      .finally(() => {
        inFlight.current = false;
        setChecking(false);
        const next = queued.current;
        queued.current = null;
        if (next) submit(next);
      });
  }, []);

  const stopRecording = useCallback(() => {
    const recorded = recordingRef.current;
    recordingRef.current = null;
    setRecording(false);
    if (recorded?.frames.length) submit({ frames: recorded.frames, final: true });
  }, [submit]);

  const startRecording = useCallback(() => {
    recordingRef.current = { frames: [], startT: performance.now() };
    setLastResult(null);
    setRecording(true);
  }, []);

  const pushFrame = useCallback(
    (frame: LandmarkFrame, t: number) => {
      if (!latest.current.enabled) return;
      const recorded = recordingRef.current;
      if (recorded) {
        recorded.frames.push(frame);
        if (t - recorded.startT >= MAX_RECORDING_MS) stopRecording();
        return;
      }
      if (latest.current.mode !== 'auto') return;
      const segment = segmenter.current.push(frame, t);
      if (segmenter.current.signing !== signingRef.current) {
        signingRef.current = segmenter.current.signing;
        setSigning(signingRef.current);
      }
      if (segment) submit(segment);
    },
    [submit, stopRecording],
  );

  return { pushFrame, signing, checking, recording, startRecording, stopRecording, lastResult, misses, error };
}
