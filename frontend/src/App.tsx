import { useEffect, useState } from 'react';
import { getLesson, signs } from './content';
import { isComplete, startLesson, summarize, type LessonState, type LessonSummary } from './lib/lessonEngine';
import { clearProgress, EMPTY_PROGRESS, loadProgress, recordCompletion, saveProgress, type Progress } from './lib/progress';
import { CompleteScreen } from './screens/CompleteScreen';
import { Dashboard } from './screens/Dashboard';
import { LessonScreen } from './screens/LessonScreen';

const REVIEW_ID = 'review';
const REVIEW_SIZE = 6;

type Screen = { name: 'dashboard' } | { name: 'lesson' } | { name: 'complete'; summary: LessonSummary };

function lessonTitle(lessonId: string): string {
  return lessonId === REVIEW_ID ? 'Review' : (getLesson(lessonId)?.title ?? 'Lesson');
}

/** Saved progress, minus an in-progress lesson that no longer matches the content. */
function restore(): { progress: Progress; screen: Screen } {
  const progress = loadProgress();
  const active = progress.active;
  if (!active) return { progress, screen: { name: 'dashboard' } };
  const known = (active.lessonId === REVIEW_ID || getLesson(active.lessonId)) && [...active.queue, ...active.done].every((s) => s in signs);
  if (!known) return { progress: { ...progress, active: null }, screen: { name: 'dashboard' } };
  // The last sign was answered but the page closed before "Continue".
  if (isComplete(active)) {
    const summary = summarize(active, Date.now());
    return { progress: recordCompletion(progress, summary, new Date()), screen: { name: 'complete', summary } };
  }
  return { progress, screen: { name: 'dashboard' } };
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function App() {
  const [initial] = useState(restore);
  const [progress, setProgress] = useState(initial.progress);
  const [screen, setScreen] = useState<Screen>(initial.screen);

  useEffect(() => saveProgress(progress), [progress]);

  const begin = (lesson: { id: string; signs: string[] }, replay: boolean) => {
    const active = startLesson(lesson, { replay, scored: true, now: Date.now() });
    setProgress((p) => ({ ...p, active }));
    setScreen({ name: 'lesson' });
  };

  const openLesson = (lessonId: string) => {
    const lesson = getLesson(lessonId);
    if (lesson) begin(lesson, Boolean(progress.completed[lessonId]));
  };

  const openReview = () => begin({ id: REVIEW_ID, signs: shuffle(progress.learned).slice(0, REVIEW_SIZE) }, true);

  const complete = (lesson: LessonState) => {
    const summary = summarize(lesson, Date.now());
    setProgress((p) => recordCompletion(p, summary, new Date()));
    setScreen({ name: 'complete', summary });
  };

  // Leaving (or resuming) right after the last sign was answered finishes the lesson.
  const leaveLesson = () => {
    if (progress.active && isComplete(progress.active)) complete(progress.active);
    else setScreen({ name: 'dashboard' });
  };
  const resumeLesson = () => {
    if (progress.active && isComplete(progress.active)) complete(progress.active);
    else setScreen({ name: 'lesson' });
  };

  if (screen.name === 'lesson' && progress.active) {
    return (
      <LessonScreen
        key={progress.active.lessonId + progress.active.startedAt}
        lesson={progress.active}
        title={lessonTitle(progress.active.lessonId)}
        onChange={(active) => setProgress((p) => ({ ...p, active }))}
        onExit={leaveLesson}
        onComplete={complete}
      />
    );
  }

  if (screen.name === 'complete') {
    const { lessonId } = screen.summary;
    return (
      <CompleteScreen
        summary={screen.summary}
        title={lessonTitle(lessonId)}
        onDone={() => setScreen({ name: 'dashboard' })}
        onReplay={() => (lessonId === REVIEW_ID ? openReview() : openLesson(lessonId))}
      />
    );
  }

  return (
    <Dashboard
      progress={progress}
      activeTitle={progress.active ? lessonTitle(progress.active.lessonId) : null}
      onOpenLesson={openLesson}
      onResume={resumeLesson}
      onReview={openReview}
      onReset={() => {
        clearProgress();
        setProgress(EMPTY_PROGRESS);
      }}
    />
  );
}
