import type { LandmarkFrame } from './api';
import { hasHands } from './landmarks';

export interface Segment {
  frames: LandmarkFrame[];
  /** True when the hands went down: the attempt is over. */
  final: boolean;
}

export const SEGMENTER_DEFAULTS = {
  /** Frames kept from just before a hand appeared. */
  preRollMs: 300,
  /** The attempt ends once no hand has been seen for this long. */
  endGapMs: 500,
  /** While hands are up, re-check every strideMs... */
  strideMs: 800,
  /** ...using at most the last windowMs of frames. */
  windowMs: 2500,
  /**
   * Don't check before this much signing has been seen: the start of one sign
   * can look like another (PLEASE began as HUNGRY 0.62 in a 0.6 s window).
   * 900 ms cost no acceptances in backend/scripts/simulate_live.py.
   */
  minMs: 900,
};

interface Timed {
  t: number;
  frame: LandmarkFrame;
}

/**
 * Splits the live landmark stream into sign attempts for automatic recognition.
 *
 * An attempt starts when a hand appears. While the hands stay up, a window of
 * recent frames is emitted every `strideMs`, so a sign is recognised even if
 * the user never lowers their hands; when the hands go down, the whole attempt
 * is emitted as final. The backend trims idle frames, so loose boundaries are fine.
 */
export class AttemptSegmenter {
  private buffer: Timed[] = [];
  private active = false;
  private startT = 0;
  private lastHandT = 0;
  private lastEmitT = 0;

  constructor(private readonly options = SEGMENTER_DEFAULTS) {}

  /** An attempt is being collected (a hand appeared and has not been down long). */
  get signing(): boolean {
    return this.active;
  }

  push(frame: LandmarkFrame, t: number): Segment | null {
    const { preRollMs, endGapMs, strideMs, windowMs, minMs } = this.options;
    const hands = hasHands(frame);
    this.buffer.push({ t, frame });

    if (!this.active) {
      this.dropBefore(t - preRollMs);
      if (hands) {
        this.active = true;
        this.startT = t;
        this.lastHandT = t;
        this.lastEmitT = t;
      }
      return null;
    }

    if (hands) this.lastHandT = t;
    if (t - this.lastHandT >= endGapMs) {
      const frames = this.buffer.map((b) => b.frame);
      this.reset();
      return { frames, final: true };
    }

    this.dropBefore(t - windowMs);
    if (t - this.startT >= minMs && t - this.lastEmitT >= strideMs) {
      this.lastEmitT = t;
      return { frames: this.buffer.map((b) => b.frame), final: false };
    }
    return null;
  }

  reset(): void {
    this.buffer = [];
    this.active = false;
  }

  private dropBefore(t: number): void {
    const keepFrom = this.buffer.findIndex((b) => b.t >= t);
    this.buffer = keepFrom === -1 ? [] : this.buffer.slice(keepFrom);
  }
}
