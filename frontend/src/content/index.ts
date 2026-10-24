// Static lesson content. lessons.json is hand-written; clips.json is generated
// by backend/scripts/make_demo_clips.py from PopSign ASL v1.0 (CC BY 4.0).
import clipsData from './clips.json';
import lessonsData from './lessons.json';

export interface Lesson {
  id: string;
  title: string;
  description: string;
  /** Sign glosses, exactly as the recognition model names them. */
  signs: string[];
}

export interface SignClip {
  src: string;
  /** Original PopSign file the clip was cut from. */
  source: string;
}

export interface Sign {
  id: string;
  label: string;
  clips: SignClip[];
}

export const lessons: Lesson[] = lessonsData.lessons;
export const attribution = clipsData.attribution;

const labels: Record<string, { label: string }> = lessonsData.signs;
const clips: Record<string, SignClip[]> = clipsData.clips;

export const signs: Record<string, Sign> = Object.fromEntries(
  Object.entries(labels).map(([id, { label }]) => [id, { id, label, clips: clips[id] ?? [] }]),
);

export function getLesson(id: string): Lesson | undefined {
  return lessons.find((lesson) => lesson.id === id);
}

/** Display name for any model gloss, including signs outside the lessons. */
export function signLabel(gloss: string): string {
  return signs[gloss]?.label ?? gloss;
}
