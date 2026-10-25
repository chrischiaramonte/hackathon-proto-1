// Learner progress, persisted in localStorage. No accounts, no server.
import type { LessonState, LessonSummary } from './lessonEngine';

export interface LessonRecord {
  completedAt: string;
  timesCompleted: number;
  bestAccuracy: number;
}

export interface Progress {
  xp: number;
  completed: Record<string, LessonRecord>;
  /** Signs signed correctly in at least one completed, scored lesson. */
  learned: string[];
  /** The lesson in progress, so a refresh resumes where the learner left off. */
  active: LessonState | null;
}

export const STORAGE_KEY = 'cosign:progress:v1';
export const EMPTY_PROGRESS: Progress = { xp: 0, completed: {}, learned: [], active: null };

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function loadProgress(storage: Store = localStorage): Progress {
  let data: unknown;
  try {
    data = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return EMPTY_PROGRESS;
  }
  if (!isRecord(data) || !isCount(data.xp) || !isRecord(data.completed) || !isStringArray(data.learned)) {
    return EMPTY_PROGRESS;
  }
  const completed: Record<string, LessonRecord> = {};
  for (const [id, record] of Object.entries(data.completed)) {
    if (isLessonRecord(record)) completed[id] = record;
  }
  // A malformed in-progress lesson is dropped without losing the rest.
  return { xp: data.xp, completed, learned: data.learned, active: isLessonState(data.active) ? data.active : null };
}

export function saveProgress(progress: Progress, storage: Store = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage full or disabled (e.g. some private modes): keep playing in memory.
  }
}

export function clearProgress(storage: Store = localStorage): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored to clear.
  }
}

export function recordCompletion(progress: Progress, summary: LessonSummary, now: Date): Progress {
  if (!summary.scored) return { ...progress, active: null };
  const previous = progress.completed[summary.lessonId];
  const learned = new Set([...progress.learned, ...summary.signs.map((s) => s.sign)]);
  return {
    xp: progress.xp + summary.totalXp,
    completed: {
      ...progress.completed,
      [summary.lessonId]: {
        completedAt: now.toISOString(),
        timesCompleted: (previous?.timesCompleted ?? 0) + 1,
        bestAccuracy: Math.max(previous?.bestAccuracy ?? 0, summary.accuracy),
      },
    },
    learned: [...learned],
    active: null,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

function isLessonRecord(v: unknown): v is LessonRecord {
  return isRecord(v) && typeof v.completedAt === 'string' && isCount(v.timesCompleted) && isCount(v.bestAccuracy);
}

function isLessonState(v: unknown): v is LessonState {
  return (
    isRecord(v) &&
    typeof v.lessonId === 'string' &&
    isStringArray(v.queue) &&
    isStringArray(v.done) &&
    isRecord(v.misses) &&
    Object.values(v.misses).every(isCount) &&
    isCount(v.xp) &&
    typeof v.replay === 'boolean' &&
    typeof v.scored === 'boolean' &&
    isCount(v.startedAt)
  );
}
