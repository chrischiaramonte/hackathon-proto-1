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
  /** Terms still in the lesson queue; the head is the current question's term. */
  queue: string[];
  /** Terms that passed both questions (or were practiced, when unscored). */
  done: string[];
  /** Misses per term across either question. */
  misses: Record<string, number>;
  xp: number;
  /** A replay of an already completed lesson earns reduced XP. */
  replay: boolean;
  /** Without camera or server the lesson is practice only: no XP, no completion. */
  scored: boolean;
  startedAt: number;
  /** Terms signed correctly in the opening vocabulary pass. */
  signedOnce?: string[];
  /** After the opening vocabulary pass, remaining questions are randomized. */
  reviewPhase?: boolean;
  /** Current review question phase for each pending term. */
  questionPhases?: Record<string, 'sign' | 'translation'>;
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
    signedOnce: [],
    reviewPhase: false,
    questionPhases: {},
  };
}

export function currentSign(state: LessonState): string | undefined {
  return state.queue[0];
}

/** In the review phase, the current term may be at either question. */
export function isReversePrompt(state: LessonState): boolean {
  const sign = currentSign(state);
  return Boolean(sign && state.reviewPhase && (state.questionPhases?.[sign] ?? 'translation') === 'translation');
}

export function isComplete(state: LessonState): boolean {
  return state.queue.length === 0;
}

/** Any miss resets only the current term to signing; later questions stay shuffled. */
export function answer(state: LessonState, outcome: Outcome): LessonState {
  const [sign, ...rest] = state.queue;
  if (sign === undefined) return state;
  const reviewPhase = state.reviewPhase === true;
  const signedOnce = state.signedOnce ?? [];
  const questionPhases = state.questionPhases ?? {};
  const questionPhase = reviewPhase ? (questionPhases[sign] ?? 'translation') : 'sign';
  if (outcome === 'incorrect') {
    return {
      ...state,
      queue: reviewPhase ? reinsertRandomly(rest, sign) : state.queue,
      questionPhases: reviewPhase ? { ...questionPhases, [sign]: 'sign' } : questionPhases,
      misses: { ...state.misses, [sign]: (state.misses[sign] ?? 0) + 1 },
    };
  }
  if (!reviewPhase) {
    const nextSigned = [...signedOnce, sign];
    if (rest.length > 0) {
      return { ...state, queue: rest, signedOnce: nextSigned, xp: state.xp + signXp(state, sign) };
    }
    const randomized = shuffle(nextSigned);
    return {
      ...state,
      queue: randomized,
      signedOnce: nextSigned,
      reviewPhase: true,
      questionPhases: Object.fromEntries(randomized.map((term) => [term, 'translation' as const])),
      xp: state.xp + signXp(state, sign),
    };
  }
  if (questionPhase === 'sign') {
    return {
      ...state,
      queue: reinsertRandomly(rest, sign),
      questionPhases: { ...questionPhases, [sign]: 'translation' },
      xp: state.xp + signXp(state, sign),
    };
  }
  const remainingPhases = { ...questionPhases };
  delete remainingPhases[sign];
  return {
    ...state,
    queue: rest,
    done: [...state.done, sign],
    questionPhases: remainingPhases,
    xp: state.xp + signXp(state, sign),
  };
}

function shuffle<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function reinsertRandomly(queue: string[], sign: string): string[] {
  if (queue.length === 0) return [sign];
  // Avoid immediately repeating the same term when another question is waiting.
  const index = 1 + Math.floor(Math.random() * queue.length);
  return [...queue.slice(0, index), sign, ...queue.slice(index)];
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
