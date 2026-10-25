import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { CameraView } from '../components/CameraView';
import { Countdown } from '../components/Countdown';
import { FeedbackSheet } from '../components/FeedbackSheet';
import { IconBolt, IconClose, IconHand } from '../components/Icons';
import { ModelGuesses } from '../components/ModelGuesses';
import { ProgressBar } from '../components/ProgressBar';
import { SignDemo } from '../components/SignDemo';
import { signLabel, signs } from '../content';
import { useRecognizer, type Recognizer } from '../hooks/useRecognizer';
import { isServerReady, type RecognitionResult, type RecognitionStatus } from '../lib/api';
import { answer, currentSign, isComplete, isReversePrompt, lessonProgress, type LessonState, type Outcome } from '../lib/lessonEngine';
import { accountApi } from '../lib/accountApi';
import { playCorrect, playWrong } from '../lib/sounds';
import styles from './LessonScreen.module.css';

/** How long the learner has to sign before it counts as a miss. */
const PRACTICE_MS = 10_000;

type Phase =
  | { name: 'learn' }
  | { name: 'practice'; startedAt: number }
  | { name: 'feedback'; sign: string; outcome: Outcome; xp: number; result: RecognitionResult | null; skipped: boolean; reverse: boolean };

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

function practiceStatus(r: Recognizer, label: string): { text: string; tone: string } {
  if (r.error) return { text: 'Can’t reach the recognition server. Is the backend running?', tone: 'error' };
  if (r.checking && !r.signing) return { text: 'Checking…', tone: 'live' };
  if (r.signing) return { text: 'Watching…', tone: 'live' };
  if (r.lastResult && r.lastResult.status !== 'accepted') return { text: RESULT_TEXT[r.lastResult.status], tone: 'warn' };
  return { text: `Raise your hands and sign “${label}”`, tone: 'idle' };
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
  const [server, setServer] = useState<'checking' | 'ok' | 'down'>('checking');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const [englishAnswer, setEnglishAnswer] = useState('');
  const readyRef = useRef<HTMLButtonElement>(null);
  const wordRef = useRef<HTMLHeadingElement>(null);
  const answerRef = useRef<HTMLInputElement>(null);
  // Set synchronously, so an answer arriving just as Skip is pressed can't count twice.
  const answered = useRef(false);

  const signId = phase.name === 'feedback' ? phase.sign : currentSign(lesson);
  const sign = signId ? signs[signId] : undefined;
  const practicing = phase.name === 'practice';
  const reverse = phase.name === 'feedback' ? phase.reverse : isReversePrompt(lesson);
  const { done: completedQuestions, total } = lessonProgress(lesson);

  const checkServer = useCallback(() => {
    setServer('checking');
    void isServerReady().then((ok) => setServer(ok ? 'ok' : 'down'));
  }, []);

  useEffect(() => {
    if (lesson.scored) checkServer();
  }, [lesson.scored, checkServer]);

  // Focus "I'm ready" for each new sign, and again once it becomes enabled.
  const canStart = reverse || !lesson.scored || (server === 'ok' && cameraReady);
  useEffect(() => {
    if (phase.name === 'learn' && canStart) readyRef.current?.focus();
  }, [phase.name, signId, canStart]);

  // "I'm ready" disappears when practice starts; move focus to the word instead of
  // dropping it on the page, so keyboard and screen reader users stay in place.
  useEffect(() => {
    if (phase.name !== 'practice') return;
    // Typed questions put the cursor straight in the answer box.
    (reverse ? answerRef : wordRef).current?.focus();
  }, [phase.name, reverse, signId]);

  // Record the outcome right away, so a refresh can never lose it.
  const finish = useCallback(
    (outcome: Outcome, result: RecognitionResult | null, skipped = false) => {
      const current = currentSign(lesson);
      if (!current || answered.current) return;
      answered.current = true;
      const reverse = isReversePrompt(lesson);
      const next = answer(lesson, outcome);
      onChange(next);
      setPhase({ name: 'feedback', sign: current, outcome, xp: next.xp - lesson.xp, result, skipped, reverse });
      // Only answers the model actually judged get a sound; skips and unscored practice stay quiet.
      if (lesson.scored && !skipped) (outcome === 'correct' ? playCorrect : playWrong)();
    },
    [lesson, onChange],
  );

  const recognizer = useRecognizer({
    target: currentSign(lesson),
    lessonId: lesson.lessonId,
    enabled: practicing && lesson.scored && !reverse,
    onAccepted: (result) => {
      if (practicing) finish('correct', result);
    },
  });

  const lastResult = useRef<RecognitionResult | null>(null);
  useEffect(() => {
    lastResult.current = recognizer.lastResult;
  });

  // The model judged an attempt and it wasn't the sign: sound it right away, not only at time's up.
  // Attempts it couldn't judge (no hands, no face, no movement) stay quiet; the hint says what to fix.
  const lastStatus = recognizer.lastResult?.status;
  useEffect(() => {
    if (lastStatus === 'rejected' || lastStatus === 'close') playWrong();
  }, [recognizer.lastResult, lastStatus]);

  // Running out of time counts as a miss (translation prompts have no time limit).
  useEffect(() => {
    if (phase.name !== 'practice' || !lesson.scored || reverse) return;
    const id = setTimeout(() => finish('incorrect', lastResult.current), phase.startedAt + PRACTICE_MS - Date.now());
    return () => clearTimeout(id);
  }, [phase, lesson.scored, reverse, finish]);

  // Losing the camera mid-attempt is not the learner's fault: back to watching, no miss.
  useEffect(() => {
    if (practicing && !reverse && lesson.scored && !cameraReady) setPhase({ name: 'learn' });
  }, [practicing, reverse, lesson.scored, cameraReady]);

  const startPractice = () => {
    answered.current = false;
    setEnglishAnswer('');
    setPhase({ name: 'practice', startedAt: Date.now() });
  };
  const submitEnglish = () => {
    const normalize = (value: string) => value.trim().toLowerCase().replace(/[?.!,]/g, '').replace(/\s+/g, ' ');
    const correct = normalize(englishAnswer) === normalize(sign?.label ?? '');
    if (correct && sign) void accountApi.translationAnswer(lesson.lessonId, sign.id, englishAnswer).catch(() => undefined);
    finish(correct ? 'correct' : 'incorrect', null);
  };
  const usePracticeMode = () => onChange({ ...lesson, scored: false });
  useLayoutEffect(() => {
    if (phase.name === 'learn' && reverse) startPractice();
  }, [phase.name, reverse, signId]);

  const continueLesson = () => {
    if (isComplete(lesson)) onComplete(lesson);
    else setPhase({ name: 'learn' });
  };

  if (!sign) return null;
  const status = practiceStatus(recognizer, sign.label);
  const missedBefore = (lesson.misses[sign.id] ?? 0) > 0;

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <button type="button" className={styles.exit} onClick={onExit} aria-label="Leave lesson (progress is saved)">
          <IconClose />
        </button>
        <ProgressBar
          value={completedQuestions}
          max={total}
          label={`${title}: ${completedQuestions} of ${total} questions complete`}
        />
        <span className={styles.xp} title="XP earned in this lesson">
          <IconBolt /> {lesson.xp}
          <span className="visually-hidden"> XP earned in this lesson</span>
        </span>
      </header>

      <main className={styles.stage}>
        {!lesson.scored && (
          <div className={`${styles.banner} ${styles.info}`} role="status">
            <span>Practice mode: recognition is off, so attempts aren’t checked and no XP is earned.</span>
            <Button variant="secondary" onClick={() => onChange({ ...lesson, scored: true })}>
              Try recognition again
            </Button>
          </div>
        )}
        {!reverse && lesson.scored && server === 'down' && (
          <div className={`${styles.banner} ${styles.warning}`} role="alert">
            <span>Can’t reach the recognition server, so signs can’t be checked right now.</span>
            <span className={styles.bannerActions}>
              <Button variant="secondary" onClick={checkServer}>
                Retry
              </Button>
              <Button variant="ghost" onClick={usePracticeMode}>
                Practice without scoring
              </Button>
            </span>
          </div>
        )}

        <div className={styles.prompt}>
          <p id="lesson-step" className={styles.eyebrow}>
            {reverse
              ? 'Your turn: type'
              : phase.name === 'learn' ? (missedBefore ? 'Let’s try this one again' : 'Watch the sign') : 'Your turn: sign'}
          </p>
          {reverse ? (
            <h1 className={styles.word}>What does this sign mean?</h1>
          ) : (
            <h1 ref={wordRef} className={styles.word} tabIndex={-1} aria-describedby="lesson-step">
              {sign.label}
            </h1>
          )}
        </div>

        <div className={styles.panels}>
          <SignDemo key={sign.id} sign={sign} compact={!reverse && phase.name !== 'learn'} />

          <div className={styles.practice}>
            {reverse ? (
              <form
                id="translation-form"
                className={styles.translationPractice}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (practicing && englishAnswer.trim()) submitEnglish();
                }}
              >
                <label htmlFor="english-answer">Type the English word or phrase</label>
                <input
                  id="english-answer"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={englishAnswer}
                  onChange={(event) => setEnglishAnswer(event.target.value)}
                  placeholder="Your answer"
                  readOnly={!practicing}
                  ref={answerRef}
                />
                <p className={styles.translationHint}>Replay the signer, or slow it down, as often as you like.</p>
              </form>
            ) : lesson.scored ? (
              <CameraView
                active={practicing}
                onFrame={recognizer.pushFrame}
                onUseWithoutCamera={usePracticeMode}
                onReadyChange={setCameraReady}
                onBlockedChange={setCameraBlocked}
                success={phase.name === 'feedback' && phase.outcome === 'correct'}
              >
                {phase.name === 'learn' && (
                  <div className={styles.cameraVeil}>
                    <IconHand className={styles.veilIcon} />
                    <p>Watch the demo, then press “I’m ready” and sign it here.</p>
                  </div>
                )}
                {practicing && (
                  <p className={`${styles.status} ${styles[status.tone]}`} aria-live="polite">
                    {status.text}
                  </p>
                )}
              </CameraView>
            ) : (
              <div className={styles.selfPractice}>
                <IconHand className={styles.veilIcon} />
                <p>Sign along with the demonstration. When you’ve practiced it a few times, continue.</p>
              </div>
            )}

            {!reverse && practicing && lesson.scored && (
              <Countdown key={phase.startedAt} startedAt={phase.startedAt} durationMs={PRACTICE_MS} />
            )}
            {practicing && recognizer.lastResult && (
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
              {reverse
                ? 'I’m ready'
                : !lesson.scored
                ? 'I’m ready'
                : server === 'checking'
                  ? 'Connecting…'
                  : server === 'down'
                    ? 'Server unavailable'
                    : cameraReady
                      ? 'I’m ready'
                      : cameraBlocked
                        ? 'Camera unavailable'
                        : 'Getting camera ready…'}
            </Button>
          )}
          {practicing && reverse && (
            <>
              <Button variant="secondary" onClick={() => finish('incorrect', null, true)}>
                Skip
              </Button>
              <Button
                type="submit"
                form="translation-form"
                size="lg"
                disabled={!englishAnswer.trim()}
                className={styles.primaryAction}
              >
                Check answer
              </Button>
            </>
          )}
          {practicing && !reverse && (
            <>
              {lesson.scored && recognizer.error && (
                <Button variant="ghost" onClick={usePracticeMode}>
                  Practice without scoring
                </Button>
              )}
              <Button
                variant="secondary"
                size={lesson.scored ? 'lg' : 'md'}
                onClick={() => finish('incorrect', lastResult.current, true)}
                className={lesson.scored ? styles.primaryAction : undefined}
              >
                Skip
              </Button>
              {!lesson.scored && (
                <Button size="lg" onClick={() => finish('correct', null)} className={styles.primaryAction}>
                  I practiced it
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
            title={lesson.scored ? PRAISE[lesson.done.length % PRAISE.length]! : 'Practiced'}
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
            title={phase.skipped ? 'Skipped' : reverse ? 'Not quite' : 'Time’s up'}
            detail={phase.reverse
              ? `The answer is “${sign.label}”. This word restarts with signing, then typing.`
              : `This word’s progress resets. Sign “${sign.label}”, then type its English meaning.${missDetail(phase.result, sign.id)}`}
            onContinue={continueLesson}
          />
        ))}
    </div>
  );
}
