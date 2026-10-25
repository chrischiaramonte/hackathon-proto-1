import { describe, expect, it } from 'vitest';
import { answer, isComplete, startLesson, summarize } from './lessonEngine';
import { clearProgress, EMPTY_PROGRESS, loadProgress, recordCompletion, saveProgress, STORAGE_KEY } from './progress';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

const lesson = { id: 'basics', signs: ['hello', 'yes'] };

function completedSummary(opts: { scored?: boolean; replay?: boolean; missFirst?: boolean } = {}) {
  let state = startLesson(lesson, { replay: opts.replay ?? false, scored: opts.scored ?? true, now: 0 });
  if (opts.missFirst) state = answer(state, 'incorrect');
  // Each word is signed once, then typed in review; answer everything correctly to the end.
  while (!isComplete(state)) state = answer(state, 'correct');
  return summarize(state, 10_000);
}

describe('progress persistence', () => {
  it('starts empty', () => {
    expect(loadProgress(memoryStorage())).toEqual(EMPTY_PROGRESS);
  });

  it('round-trips through storage, including an in-progress lesson', () => {
    const storage = memoryStorage();
    const active = answer(startLesson(lesson, { replay: false, scored: true, now: 5 }), 'incorrect');
    const progress = { ...EMPTY_PROGRESS, xp: 40, learned: ['mom'], active };
    saveProgress(progress, storage);
    expect(loadProgress(storage)).toEqual(progress);
  });

  it('survives corrupt data', () => {
    expect(loadProgress(memoryStorage({ [STORAGE_KEY]: '{not json' }))).toEqual(EMPTY_PROGRESS);
    expect(loadProgress(memoryStorage({ [STORAGE_KEY]: '{"xp":"lots"}' }))).toEqual(EMPTY_PROGRESS);
    expect(loadProgress(memoryStorage({ [STORAGE_KEY]: '[]' }))).toEqual(EMPTY_PROGRESS);
  });

  it('drops a malformed in-progress lesson but keeps XP', () => {
    const raw = JSON.stringify({ xp: 30, completed: {}, learned: ['hello'], active: { lessonId: 3 } });
    expect(loadProgress(memoryStorage({ [STORAGE_KEY]: raw }))).toEqual({
      xp: 30,
      completed: {},
      learned: ['hello'],
      active: null,
    });
  });

  it('keeps playing when storage is unavailable', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadProgress(broken)).toEqual(EMPTY_PROGRESS);
    expect(() => saveProgress(EMPTY_PROGRESS, broken)).not.toThrow();
    expect(() => clearProgress(broken)).not.toThrow();
  });

  it('clears saved progress', () => {
    const storage = memoryStorage();
    saveProgress({ ...EMPTY_PROGRESS, xp: 10 }, storage);
    clearProgress(storage);
    expect(loadProgress(storage)).toEqual(EMPTY_PROGRESS);
  });
});

describe('recording a completed lesson', () => {
  it('adds XP, learned signs and a completion record, and ends the active lesson', () => {
    const summary = completedSummary();
    const before = { ...EMPTY_PROGRESS, xp: 5, learned: ['mom'], active: startLesson(lesson, { replay: false, scored: true, now: 0 }) };
    const after = recordCompletion(before, summary, new Date('2026-10-24T12:00:00Z'));
    expect(after.xp).toBe(5 + summary.totalXp);
    expect(after.learned.sort()).toEqual(['hello', 'mom', 'yes']);
    expect(after.completed.basics).toEqual({ completedAt: '2026-10-24T12:00:00.000Z', timesCompleted: 1, bestAccuracy: 1 });
    expect(after.active).toBeNull();
  });

  it('counts replays and keeps the best accuracy', () => {
    let progress = recordCompletion(EMPTY_PROGRESS, completedSummary(), new Date());
    progress = recordCompletion(progress, completedSummary({ replay: true, missFirst: true }), new Date());
    expect(progress.completed.basics?.timesCompleted).toBe(2);
    expect(progress.completed.basics?.bestAccuracy).toBe(1);
    expect(progress.learned).toHaveLength(2);
  });

  it('does not reward an unscored practice run', () => {
    const before = { ...EMPTY_PROGRESS, xp: 12 };
    const after = recordCompletion(before, completedSummary({ scored: false }), new Date());
    expect(after).toEqual(before);
  });
});
