import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { CameraView } from '../components/CameraView';
import { Countdown } from '../components/Countdown';
import { FeedbackSheet } from '../components/FeedbackSheet';
import { IconBolt, IconClose, IconHand } from '../components/Icons';
import { ModelGuesses } from '../components/ModelGuesses';
import { ProgressBar } from '../components/ProgressBar';
import { SignDemo } from '../components/SignDemo';
import { signLabel, signs } from '../content';
import { useRecognizer, type CaptureMode, type Recognizer } from '../hooks/useRecognizer';
import { isServerReady, type RecognitionResult, type RecognitionStatus } from '../lib/api';
import { answer, currentSign, isComplete, type LessonState, type Outcome } from '../lib/lessonEngine';
import styles from './LessonScreen.module.css';

/** Auto mode: how long the learner has to sign before it counts as a miss. */
const PRACTICE_MS = 20_000;
/** Manual mode: scored tries before it counts as a miss. */
const MANUAL_TRIES = 3;

type Phase =
  | { name: 'learn' }
  | { name: 'practice'; startedAt: number }
  | { name: 'feedback'; sign: string; outcome: Outcome; xp: number; result: RecognitionResult | null; skipped: boolean };

const RESULT_TEXT: Record<Exclude<RecognitionStatus, 'accepted'>, string> = {
  close: 'So close! Try it again.',
  rejected: 'Not quite. Watch the demo and try again.',
  no_hands: 'We couldn’t see your hands. Keep them in the frame.',
  no_face: 'Keep your face in view while you sign.',
  no_motion: 'Show the whole movement, not just the handshape.',
};

const PRAISE = ['Nice signing!', 'You got it!', 'Great job!', 'Excellent!'];

/** What the model saw on the last attempt, if it was a different sign. */
function missDetail(result: RecognitionResult | null, target: string): string {
  const top = result?.topPredictions[0];
  return top && top.sign !== target ? ` The model saw “${signLabel(top.sign)}” instead.` : '';
}

function practiceStatus(r: Recognizer, mode: CaptureMode, label: string): { text: string; tone: string } {
  if (r.error) return { text: 'Can’t reach the recognition server. Is the backend running?', tone: 'error' };
  if (r.recording) return { text: 'Recording… sign now, then press Stop', tone: 'live' };
  if (r.checking && (mode === 'manual' || !r.signing)) return { text: 'Checking…', tone: 'live' };
  if (r.signing) return { text: 'Watching…', tone: 'live' };
  if (r.lastResult && r.lastResult.status !== 'accepted') return { text: RESULT_TEXT[r.lastResult.status], tone: 'warn' };
  return { text: mode === 'auto' ? `Raise your hands and sign “${label}”` : 'Press Record, then sign', tone: 'idle' };
}

interface Props {
  lesson: LessonState;
  title: string;
  onChange: (lesson: LessonState) => void;
  onExit: () => void;
  onComplete: (lesson: LessonState) => void;
}

export function LessonScreen({ lesson, title, onChange, onExit, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>({ name: 'learn' });
  const [mode, setMode] = useState<CaptureMode>('auto');
  const [server, setServer] = useState<'checking' | 'ok' | 'down'>('checking');
  const [cameraReady, setCameraReady] = useState(false);
  const readyRef = useRef<HTMLButtonElement>(null);
  // Set synchronously, so an answer arriving just as Skip is pressed can't count twice.
  const answered = useRef(false);

  const signId = phase.name === 'feedback' ? phase.sign : currentSign(lesson);
  const sign = signId ? signs[signId] : undefined;
  const total = lesson.done.length + lesson.queue.length;
  const practising = phase.name === 'practice';

  const checkServer = useCallback(() => {
    setServer('checking');
    void isServerReady().then((ok) => setServer(ok ? 'ok' : 'down'));
  }, []);

  useEffect(() => {
    if (lesson.scored) checkServer();
  }, [lesson.scored, checkServer]);

  // Focus "I'm ready" for each new sign, and again once it becomes enabled.
  const canStart = !lesson.scored || (server === 'ok' && cameraReady);
  useEffect(() => {
    if (phase.name === 'learn' && canStart) readyRef.current?.focus();
  }, [phase.name, signId, canStart]);

  // Record the outcome right away, so a refresh can never lose it.
  const finish = useCallback(
    (outcome: Outcome, result: RecognitionResult | null, skipped = false) => {
      const current = currentSign(lesson);
      if (!current || answered.current) return;
      answered.current = true;
      const next = answer(lesson, outcome);
      onChange(next);
      setPhase({ name: 'feedback', sign: current, outcome, xp: next.xp - lesson.xp, result, skipped });
    },
    [lesson, onChange],
  );

  const recognizer = useRecognizer({
    target: currentSign(lesson),
    enabled: practising && lesson.scored,
    mode,
    onAccepted: (result) => {
      if (practising) finish('correct', result);
    },
  });

  const lastResult = useRef<RecognitionResult | null>(null);
  useEffect(() => {
    lastResult.current = recognizer.lastResult;
  });

  // Auto mode: running out of time counts as a miss.
  useEffect(() => {
    if (phase.name !== 'practice' || mode !== 'auto' || !lesson.scored) return;
    const id = setTimeout(() => finish('incorrect', lastResult.current), phase.startedAt + PRACTICE_MS - Date.now());
    return () => clearTimeout(id);
  }, [phase, mode, lesson.scored, finish]);

  // Manual mode: a limited number of scored tries.
  useEffect(() => {
    if (practising && mode === 'manual' && recognizer.misses >= MANUAL_TRIES) finish('incorrect', lastResult.current);
  }, [practising, mode, recognizer.misses, finish]);

  // Losing the camera mid-attempt is not the learner's fault: back to watching, no miss.
  useEffect(() => {
    if (practising && lesson.scored && !cameraReady) setPhase({ name: 'learn' });
  }, [practising, lesson.scored, cameraReady]);

  const startPractice = () => {
    answered.current = false;
    setPhase({ name: 'practice', startedAt: Date.now() });
  };
  const usePracticeMode = () => onChange({ ...lesson, scored: false });

  const continueLesson = () => {
    if (isComplete(lesson)) onComplete(lesson);
    else setPhase({ name: 'learn' });
  };

  if (!sign) return null;
  const status = practiceStatus(recognizer, mode, sign.label);
  const missedBefore = (lesson.misses[sign.id] ?? 0) > 0;

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <button type="button" className={styles.exit} onClick={onExit} aria-label="Leave lesson (progress is saved)">
          <IconClose />
        </button>
        <ProgressBar value={lesson.done.length} max={total} label={`${title}: ${lesson.done.length} of ${total} signs done`} />
        <span className={styles.xp} title="XP earned in this lesson">
          <IconBolt /> {lesson.xp}
        </span>
      </header>

      {!lesson.scored && (
        <div className={`${styles.banner} ${styles.info}`}>
          <span>Practice mode: recognition is off, so attempts aren’t checked and no XP is earned.</span>
          <Button variant="secondary" onClick={() => onChange({ ...lesson, scored: true })}>
            Try recognition again
          </Button>
        </div>
      )}
      {lesson.scored && server === 'down' && (
        <div className={`${styles.banner} ${styles.warning}`} role="alert">
          <span>Can’t reach the recognition server, so signs can’t be checked right now.</span>
          <span className={styles.bannerActions}>
            <Button variant="secondary" onClick={checkServer}>
              Retry
            </Button>
            <Button variant="ghost" onClick={usePracticeMode}>
              Practise without scoring
            </Button>
          </span>
        </div>
      )}

      <main className={styles.stage}>
        <div className={styles.prompt}>
          <p className={styles.eyebrow}>
            {phase.name === 'learn' ? (missedBefore ? 'Let’s try this one again' : 'Watch the sign') : 'Your turn: sign'}
          </p>
          <h1 className={styles.word}>{sign.label}</h1>
        </div>

        <div className={styles.panels}>
          <SignDemo key={sign.id} sign={sign} compact={phase.name !== 'learn'} />

          <div className={styles.practice}>
            {lesson.scored ? (
              <CameraView
                active={practising}
                onFrame={recognizer.pushFrame}
                onUseWithoutCamera={usePracticeMode}
                onReadyChange={setCameraReady}
              >
                {phase.name === 'learn' && (
                  <div className={styles.cameraVeil}>
                    <IconHand className={styles.veilIcon} />
                    <p>Watch the demo, then press “I’m ready” and sign it here.</p>
                  </div>
                )}
                {practising && (
                  <p className={`${styles.status} ${styles[status.tone]}`} aria-live="polite">
                    {status.text}
                  </p>
                )}
              </CameraView>
            ) : (
              <div className={styles.selfPractice}>
                <IconHand className={styles.veilIcon} />
                <p>Sign along with the demonstration. When you’ve practised it a few times, continue.</p>
              </div>
            )}

            {practising && lesson.scored && mode === 'auto' && (
              <Countdown key={phase.startedAt} startedAt={phase.startedAt} durationMs={PRACTICE_MS} />
            )}
            {practising && lesson.scored && mode === 'manual' && (
              <p className={styles.tries}>
                Try {Math.min(recognizer.misses + 1, MANUAL_TRIES)} of {MANUAL_TRIES}
              </p>
            )}
            {practising && recognizer.lastResult && (
              <ModelGuesses predictions={recognizer.lastResult.topPredictions} target={sign.id} />
            )}
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          {phase.name === 'learn' && (
            <Button
              ref={readyRef}
              size="lg"
              onClick={startPractice}
              disabled={!canStart}
              className={styles.primaryAction}
            >
              {!lesson.scored
                ? 'I’m ready'
                : server === 'checking'
                  ? 'Connecting…'
                  : server === 'down'
                    ? 'Server unavailable'
                    : cameraReady
                      ? 'I’m ready'
                      : 'Getting camera ready…'}
            </Button>
          )}
          {practising && (
            <>
              <Button variant="secondary" onClick={() => finish('incorrect', lastResult.current, true)}>
                Skip
              </Button>
              {lesson.scored && (
                <label className={styles.modeToggle}>
                  <input
                    type="checkbox"
                    checked={mode === 'manual'}
                    onChange={(e) => {
                      setMode(e.target.checked ? 'manual' : 'auto');
                      setPhase({ name: 'practice', startedAt: Date.now() });
                    }}
                  />
                  Manual capture
                </label>
              )}
              {lesson.scored && recognizer.error && (
                <Button variant="ghost" onClick={usePracticeMode}>
                  Practise without scoring
                </Button>
              )}
              {lesson.scored && mode === 'manual' && (
                <Button
                  size="lg"
                  variant={recognizer.recording ? 'danger' : 'primary'}
                  onClick={recognizer.recording ? recognizer.stopRecording : recognizer.startRecording}
                  disabled={recognizer.checking}
                  className={styles.primaryAction}
                >
                  {recognizer.recording ? 'Stop' : 'Record'}
                </Button>
              )}
              {!lesson.scored && (
                <Button size="lg" onClick={() => finish('correct', null)} className={styles.primaryAction}>
                  I practised it
                </Button>
              )}
            </>
          )}
        </div>
      </footer>

      {phase.name === 'feedback' &&
        (phase.outcome === 'correct' ? (
          <FeedbackSheet
            tone="success"
            title={lesson.scored ? PRAISE[lesson.done.length % PRAISE.length]! : 'Practised'}
            detail={
              phase.result?.targetProbability != null
                ? `“${sign.label}”: the model is ${Math.round(phase.result.targetProbability * 100)}% sure`
                : undefined
            }
            xp={phase.xp}
            onContinue={continueLesson}
          />
        ) : (
          <FeedbackSheet
            tone="danger"
            title={phase.skipped ? 'Skipped' : mode === 'manual' ? 'Not this time' : 'Time’s up'}
            detail={`We’ll come back to “${sign.label}” at the end of the lesson.${missDetail(phase.result, sign.id)}`}
            onContinue={continueLesson}
          />
        ))}
    </div>
  );
}
