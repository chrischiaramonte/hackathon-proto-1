import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, recognize, type LandmarkFrame, type RecognitionResult } from '../lib/api';
import { AttemptSegmenter, type Segment } from '../lib/segmenter';

interface Options {
  target: string | undefined;
  lessonId?: string;
  /** Frames are ignored unless enabled (e.g. outside the practice phase). */
  enabled: boolean;
  onAccepted: (result: RecognitionResult) => void;
}

export interface Recognizer {
  pushFrame: (frame: LandmarkFrame, t: number) => void;
  /** A hand is up and an attempt is being collected. */
  signing: boolean;
  checking: boolean;
  /** The last finished attempt that was not accepted. */
  lastResult: RecognitionResult | null;
  error: ApiError | null;
}

/**
 * Sends sign attempts to the recognition server and reports the outcome.
 *
 * The live landmark stream is segmented into attempts (see AttemptSegmenter).
 * One request is in flight at a time; a window that is not accepted is silent, so the user
 * is never told "wrong" while still mid-sign.
 */
export function useRecognizer({ target, lessonId, enabled, onAccepted }: Options): Recognizer {
  const segmenter = useRef(new AttemptSegmenter());
  const generation = useRef(0);
  const inFlight = useRef(false);
  const queued = useRef<Segment | null>(null);
  const signingRef = useRef(false);
  const latest = useRef({ target, lessonId, enabled, onAccepted });

  const [signing, setSigning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [lastResult, setLastResult] = useState<RecognitionResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    latest.current = { target, lessonId, enabled, onAccepted };
  });

  // New sign or phase: start clean and ignore answers still in flight.
  useEffect(() => {
    generation.current += 1;
    segmenter.current.reset();
    queued.current = null;
    signingRef.current = false;
    setSigning(false);
    setLastResult(null);
    setError(null);
  }, [target, lessonId, enabled]);

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

  const pushFrame = useCallback(
    (frame: LandmarkFrame, t: number) => {
      if (!latest.current.enabled) return;
      const segment = segmenter.current.push(frame, t);
      if (segmenter.current.signing !== signingRef.current) {
        signingRef.current = segmenter.current.signing;
        setSigning(signingRef.current);
      }
      if (segment) submit(segment);
    },
    [submit],
  );

  return { pushFrame, signing, checking, lastResult, error };
}
