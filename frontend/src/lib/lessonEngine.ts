// Pure lesson state: which sign is next, what was missed, how much XP was earned.
// No React, no timers, no storage; the lesson screen drives it.

export const XP = {
  firstTry: 10,
  afterMiss: 5,
  /** Awarded only the first time a lesson is completed. */
  completionBonus: 20,
  /** Replaying a completed lesson earns half, so the easiest lesson can't be farmed. */
  replayMultiplier: 0.5,
} as const;

export interface LessonState {
  lessonId: string;
  /** Signs still to be signed correctly; the head is the current question. */
  queue: string[];
  /** Signs signed correctly (or practised, when unscored), in order. */
  done: string[];
  /** Misses per sign. */
  misses: Record<string, number>;
  xp: number;
  /** A replay of an already completed lesson earns reduced XP. */
  replay: boolean;
  /** Without camera or server the lesson is practice only: no XP, no completion. */
  scored: boolean;
  startedAt: number;
}

export type Outcome = 'correct' | 'incorrect';

export function startLesson(
  lesson: { id: string; signs: string[] },
  options: { replay: boolean; scored: boolean; now: number },
): LessonState {
  return {
    lessonId: lesson.id,
    queue: [...lesson.signs],
    done: [],
    misses: {},
    xp: 0,
    replay: options.replay,
    scored: options.scored,
    startedAt: options.now,
  };
}

export function currentSign(state: LessonState): string | undefined {
  return state.queue[0];
}

/** Start with two signing prompts, then introduce a translation prompt every other sign. */
export function isReversePrompt(state: LessonState): boolean {
  return state.done.length >= 2 && state.done.length % 2 === 0;
}

export function isComplete(state: LessonState): boolean {
  return state.queue.length === 0;
}

/** Record the outcome for the current sign. Incorrect signs go to the back of the queue. */
export function answer(state: LessonState, outcome: Outcome): LessonState {
  const [sign, ...rest] = state.queue;
  if (sign === undefined) return state;
  if (outcome === 'incorrect') {
    return { ...state, queue: [...rest, sign], misses: { ...state.misses, [sign]: (state.misses[sign] ?? 0) + 1 } };
  }
  return { ...state, queue: rest, done: [...state.done, sign], xp: state.xp + signXp(state, sign) };
}

function signXp(state: LessonState, sign: string): number {
  if (!state.scored) return 0;
  const base = state.misses[sign] ? XP.afterMiss : XP.firstTry;
  return state.replay ? Math.round(base * XP.replayMultiplier) : base;
}

export interface LessonSummary {
  lessonId: string;
  scored: boolean;
  signXp: number;
  bonusXp: number;
  totalXp: number;
  /** Share of signs signed correctly on the first try. */
  accuracy: number;
  signs: { sign: string; misses: number }[];
  durationMs: number;
}

export function summarize(state: LessonState, now: number): LessonSummary {
  const bonusXp = state.scored && !state.replay ? XP.completionBonus : 0;
  const firstTry = state.done.filter((sign) => !state.misses[sign]).length;
  return {
    lessonId: state.lessonId,
    scored: state.scored,
    signXp: state.xp,
    bonusXp,
    totalXp: state.xp + bonusXp,
    accuracy: state.done.length ? firstTry / state.done.length : 0,
    signs: state.done.map((sign) => ({ sign, misses: state.misses[sign] ?? 0 })),
    durationMs: now - state.startedAt,
  };
}
