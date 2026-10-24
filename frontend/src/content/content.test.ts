import { describe, expect, it } from 'vitest';
import { attribution, getLesson, lessons, signLabel, signs } from '.';

// Files that exist in public/signs, as '/signs/<name>.mp4'.
const clipFiles = new Set(
  Object.keys(import.meta.glob('../../public/signs/*.mp4')).map((path) => path.replace('../../public', '')),
);

describe('lesson content', () => {
  it('gives every lesson sign a label and at least one demonstration clip on disk', () => {
    for (const lesson of lessons) {
      expect(lesson.signs.length).toBeGreaterThan(0);
      for (const id of lesson.signs) {
        const sign = signs[id];
        expect(sign, `${lesson.id}: ${id}`).toBeDefined();
        expect(sign!.clips.length, `${id} clips`).toBeGreaterThan(0);
        for (const clip of sign!.clips) {
          expect(clipFiles.has(clip.src), clip.src).toBe(true);
        }
      }
    }
  });

  it('has unique lesson ids and no repeated sign within a lesson', () => {
    expect(new Set(lessons.map((l) => l.id)).size).toBe(lessons.length);
    for (const lesson of lessons) expect(new Set(lesson.signs).size).toBe(lesson.signs.length);
  });

  it('credits the video source and its licence', () => {
    expect(attribution.license).toBe('CC BY 4.0');
    expect(attribution.dataset).toMatch(/PopSign/);
  });

  it('looks up lessons and labels', () => {
    expect(getLesson('first-words')?.title).toBe('First words');
    expect(getLesson('nope')).toBeUndefined();
    expect(signLabel('thankyou')).toBe('Thank you');
    expect(signLabel('callonphone')).toBe('callonphone');
  });
});
