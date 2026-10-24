// Client for the FastAPI recognition service (backend/app/schemas.py).

export type Point = [number, number, number];

/** One MediaPipe Holistic result; `null` means that part was not detected. */
export interface LandmarkFrame {
  face: Point[] | null;
  leftHand: Point[] | null;
  pose: Point[] | null;
  rightHand: Point[] | null;
}

export type RecognitionStatus = 'accepted' | 'close' | 'rejected' | 'no_hands' | 'no_face' | 'no_motion';

export interface Prediction {
  sign: string;
  probability: number;
}

export interface RecognitionResult {
  target: string;
  status: RecognitionStatus;
  accepted: boolean;
  targetProbability: number | null;
  targetRank: number | null;
  topPredictions: Prediction[];
  framesReceived: number;
  framesUsed: number;
  handFrames: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: 'network' | 'timeout' | 'server',
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 10_000;
/** The model reads at most 384 frames; the API rejects longer sequences. */
export const MAX_FRAMES = 384;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError('The recognition server took too long to answer.', 'timeout');
    }
    throw new ApiError('Could not reach the recognition server.', 'network');
  }
  if (!response.ok) {
    throw new ApiError(`The recognition server returned an error (${response.status}).`, 'server');
  }
  return (await response.json()) as T;
}

export function recognize(target: string, frames: LandmarkFrame[]): Promise<RecognitionResult> {
  return request<RecognitionResult>('/recognize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, frames: frames.slice(-MAX_FRAMES) }),
  });
}

export async function isServerReady(): Promise<boolean> {
  try {
    await request<{ status: 'ok' }>('/health');
    return true;
  } catch {
    return false;
  }
}
