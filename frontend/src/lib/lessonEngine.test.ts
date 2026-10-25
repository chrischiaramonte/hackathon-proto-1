import { describe, expect, it } from 'vitest';
import { answer, currentSign, isComplete, isReversePrompt, lessonProgress, startLesson, summarize, XP, type LessonState } from './lessonEngine';

const lesson = { id: 'basics', signs: ['hello', 'please', 'thankyou'] };
const fresh = (opts: Partial<{ replay: boolean; scored: boolean }> = {}) =>
  startLesson(lesson, { replay: false, scored: true, now: 1000, ...opts });

/** Answer every remaining question correctly. Review order is shuffled, so tests don't depend on it. */
function finish(state: LessonState): { state: LessonState; answers: number } {
  let answers = 0;
  while (!isComplete(state)) {
    state = answer(state, 'correct');
    answers++;
  }
  return { state, answers };
}

/** Sign every word once, correctly, to reach the review. */
function signAll(state: LessonState): LessonState {
  for (let i = 0; i < lesson.signs.length; i++) state = answer(state, 'correct');
  return state;
}

describe('lesson engine', () => {
  it('asks the signs in order during the first pass', () => {
    let state = fresh();
    expect(currentSign(state)).toBe('hello');
    state = answer(state, 'correct');
    expect(currentSign(state)).toBe('please');
  });

  it('keeps a missed sign current during the first pass', () => {
    const state = answer(fresh(), 'incorrect');
    expect(state.queue).toEqual(['hello', 'please', 'thankyou']);
    expect(state.misses).toEqual({ hello: 1 });
    expect(state.xp).toBe(0);
  });

  it('after every word is signed once, asks each one back as a typed question', () => {
    const state = signAll(fresh());
    expect(state.reviewPhase).toBe(true);
    expect([...state.queue].sort()).toEqual(['hello', 'please', 'thankyou']);
    expect(isReversePrompt(state)).toBe(true);
    expect(isComplete(state)).toBe(false);
  });

  it('only completes once every word passes both its signing and typed question', () => {
    const { state, answers } = finish(fresh());
    expect(answers).toBe(2 * lesson.signs.length);
    expect([...state.done].sort()).toEqual(['hello', 'please', 'thankyou']);
  });

  it('a miss in review sends the word back to signing, then to typing again', () => {
    let state = signAll(fresh());
    const word = currentSign(state)!;
    state = answer(state, 'incorrect');
    expect(state.misses[word]).toBe(1);
    expect(state.questionPhases?.[word]).toBe('sign');
    expect(state.queue).toContain(word);
    expect(state.done).not.toContain(word);
    // The other two words need their typed answer; the missed word needs signing and typing again.
    expect(finish(state).answers).toBe(2 + 2);
  });

  it('awards full XP for each first-try answer and less after a miss', () => {
    expect(finish(fresh()).state.xp).toBe(2 * lesson.signs.length * XP.firstTry);
    const missedHello = finish(answer(fresh(), 'incorrect')).state;
    expect(missedHello.xp).toBe(2 * XP.afterMiss + 4 * XP.firstTry);
  });

  it('halves XP when replaying a completed lesson, with no completion bonus', () => {
    const summary = summarize(finish(fresh({ replay: true })).state, 5000);
    expect(summary.signXp).toBe(2 * lesson.signs.length * XP.firstTry * XP.replayMultiplier);
    expect(summary.bonusXp).toBe(0);
  });

  it('awards nothing in unscored practice mode', () => {
    const summary = summarize(finish(fresh({ scored: false })).state, 5000);
    expect(summary.totalXp).toBe(0);
    expect(summary.scored).toBe(false);
  });

  it('summarises XP, first-try accuracy and duration', () => {
    const summary = summarize(finish(answer(fresh(), 'incorrect')).state, 61_000);
    expect(summary.totalXp).toBe(2 * XP.afterMiss + 4 * XP.firstTry + XP.completionBonus);
    expect(summary.accuracy).toBeCloseTo(2 / 3);
    expect(summary.durationMs).toBe(60_000);
    expect([...summary.signs].sort((a, b) => a.sign.localeCompare(b.sign))).toEqual([
      { sign: 'hello', misses: 1 },
      { sign: 'please', misses: 0 },
      { sign: 'thankyou', misses: 0 },
    ]);
  });

  it('counts progress in questions: each word signed once, then typed', () => {
    let state = fresh();
    expect(lessonProgress(state)).toEqual({ done: 0, total: 6 });
    state = answer(state, 'correct');
    expect(lessonProgress(state)).toEqual({ done: 1, total: 6 });
    state = signAll(fresh());
    expect(lessonProgress(state)).toEqual({ done: 3, total: 6 });
    expect(lessonProgress(finish(state).state)).toEqual({ done: 6, total: 6 });
  });

  it('ignores answers once the lesson is complete', () => {
    const { state } = finish(startLesson({ id: 'x', signs: ['yes'] }, { replay: false, scored: true, now: 0 }));
    expect(answer(state, 'correct')).toBe(state);
  });
});
