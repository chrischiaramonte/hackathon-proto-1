import { describe, expect, it } from 'vitest';
import { answer, currentSign, isComplete, startLesson, summarize, XP } from './lessonEngine';

const lesson = { id: 'basics', signs: ['hello', 'please', 'thankyou'] };
const fresh = (opts: Partial<{ replay: boolean; scored: boolean }> = {}) =>
  startLesson(lesson, { replay: false, scored: true, now: 1000, ...opts });

describe('lesson engine', () => {
  it('asks the signs in order', () => {
    let state = fresh();
    expect(currentSign(state)).toBe('hello');
    state = answer(state, 'correct');
    expect(currentSign(state)).toBe('please');
  });

  it('moves an incorrect sign to the back of the queue', () => {
    const state = answer(fresh(), 'incorrect');
    expect(state.queue).toEqual(['please', 'thankyou', 'hello']);
    expect(state.misses).toEqual({ hello: 1 });
    expect(state.xp).toBe(0);
  });

  it('only completes once every sign has been signed correctly', () => {
    let state = fresh();
    state = answer(state, 'correct'); // hello
    state = answer(state, 'incorrect'); // please -> back
    state = answer(state, 'correct'); // thankyou
    expect(isComplete(state)).toBe(false);
    expect(currentSign(state)).toBe('please');
    state = answer(state, 'incorrect'); // the last sign keeps coming back
    expect(currentSign(state)).toBe('please');
    state = answer(state, 'correct');
    expect(isComplete(state)).toBe(true);
    expect(state.done).toEqual(['hello', 'thankyou', 'please']);
  });

  it('awards full XP on the first try and less after a miss', () => {
    let state = fresh();
    state = answer(state, 'correct');
    expect(state.xp).toBe(XP.firstTry);
    state = answer(state, 'incorrect');
    state = answer(state, 'correct'); // thankyou, first try
    state = answer(state, 'correct'); // please, after a miss
    expect(state.xp).toBe(2 * XP.firstTry + XP.afterMiss);
  });

  it('halves XP when replaying a completed lesson, with no completion bonus', () => {
    let state = fresh({ replay: true });
    for (let i = 0; i < 3; i++) state = answer(state, 'correct');
    const summary = summarize(state, 5000);
    expect(summary.signXp).toBe(3 * XP.firstTry * XP.replayMultiplier);
    expect(summary.bonusXp).toBe(0);
  });

  it('awards nothing in unscored practice mode', () => {
    let state = fresh({ scored: false });
    for (let i = 0; i < 3; i++) state = answer(state, 'correct');
    const summary = summarize(state, 5000);
    expect(summary.totalXp).toBe(0);
    expect(summary.scored).toBe(false);
  });

  it('summarises XP, first-try accuracy and duration', () => {
    let state = fresh();
    state = answer(state, 'incorrect');
    for (let i = 0; i < 3; i++) state = answer(state, 'correct');
    const summary = summarize(state, 61_000);
    expect(summary.totalXp).toBe(2 * XP.firstTry + XP.afterMiss + XP.completionBonus);
    expect(summary.accuracy).toBeCloseTo(2 / 3);
    expect(summary.durationMs).toBe(60_000);
    expect(summary.signs).toEqual([
      { sign: 'please', misses: 0 },
      { sign: 'thankyou', misses: 0 },
      { sign: 'hello', misses: 1 },
    ]);
  });

  it('ignores answers once the lesson is complete', () => {
    let state = startLesson({ id: 'x', signs: ['yes'] }, { replay: false, scored: true, now: 0 });
    state = answer(state, 'correct');
    expect(answer(state, 'correct')).toBe(state);
  });
});
