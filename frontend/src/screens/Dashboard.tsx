import { useState } from 'react';
import { Button } from '../components/Button';
import { IconArrowRight, IconBolt, IconCamera, IconCheck, IconHand, IconStar } from '../components/Icons';
import { Logo } from '../components/Logo';
import { ProgressBar } from '../components/ProgressBar';
import { attribution, lessons, signLabel } from '../content';
import type { Progress } from '../lib/progress';
import styles from './Dashboard.module.css';
import type { AccountProfile } from '../lib/accountApi';

/** Review needs a few learned signs to be worth it. */
const MIN_REVIEW_SIGNS = 3;

interface Props {
  progress: Progress;
  activeTitle: string | null;
  onOpenLesson: (lessonId: string) => void;
  onResume: () => void;
  onReview: () => void;
  onReset: () => void;
  account: AccountProfile | null;
  onManageAccount: () => void;
}

export function Dashboard({ progress, activeTitle, onOpenLesson, onResume, onReview, onReset, account, onManageAccount }: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  const next = lessons.find((lesson) => !progress.completed[lesson.id]);
  const active = progress.active;
  const completedCount = lessons.filter((lesson) => progress.completed[lesson.id]).length;

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Logo />
        <Button variant="secondary" onClick={onManageAccount}>{account ? account.displayName : 'Leaderboard'}</Button>
        <div className={styles.stats}>
          <span className={styles.stat} title={account ? 'Server tracked leaderboard XP' : 'XP on this device'}>
            <IconBolt className={styles.bolt} /> {account ? account.xp : progress.xp} XP
          </span>
          <span className={styles.stat} title="Signs learned">
            <IconHand /> {progress.learned.length} signs
          </span>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          {active && activeTitle ? (
            <>
              <p className={styles.kicker}>Pick up where you left off</p>
              <h1 className={styles.heroTitle}>{activeTitle}</h1>
              <div className={styles.heroProgress}>
                <ProgressBar
                  value={active.done.length}
                  max={active.done.length + active.queue.length}
                  label="Lesson progress"
                />
                <span>
                  {active.done.length}/{active.done.length + active.queue.length}
                </span>
              </div>
              <Button size="lg" onClick={onResume}>
                Continue <IconArrowRight />
              </Button>
            </>
          ) : (
            <>
              <p className={styles.kicker}>{completedCount === 0 ? 'Learn ASL with your webcam' : 'Keep going'}</p>
              <h1 className={styles.heroTitle}>
                {next ? `Up next: ${next.title}` : 'You’ve finished every lesson!'}
              </h1>
              <p className={styles.heroText}>
                Watch a Deaf signer, sign it back to your camera, and get instant feedback from a sign-recognition
                model.
              </p>
              {next ? (
                <Button size="lg" onClick={() => onOpenLesson(next.id)}>
                  {completedCount === 0 ? 'Start learning' : 'Start lesson'} <IconArrowRight />
                </Button>
              ) : (
                <Button size="lg" onClick={onReview} disabled={progress.learned.length < MIN_REVIEW_SIGNS}>
                  Review your signs <IconArrowRight />
                </Button>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="lessons-heading">
          <h2 id="lessons-heading" className={styles.sectionTitle}>
            Lessons
          </h2>
          <ol className={styles.path}>
            {lessons.map((lesson, i) => {
              const record = progress.completed[lesson.id];
              const inProgress = active?.lessonId === lesson.id;
              return (
                <li key={lesson.id} className={`${styles.lesson} ${record ? styles.done : ''}`}>
                  <span className={styles.node} aria-hidden="true">
                    {record ? <IconCheck /> : i + 1}
                  </span>
                  <div className={styles.lessonBody}>
                    <h3 className={styles.lessonTitle}>{lesson.title}</h3>
                    <p className={styles.lessonText}>{lesson.description}</p>
                    <ul className={styles.chips} aria-label="Signs in this lesson">
                      {lesson.signs.map((sign) => (
                        <li key={sign} className={progress.learned.includes(sign) ? styles.learned : undefined}>
                          {signLabel(sign)}
                        </li>
                      ))}
                    </ul>
                    {record && (
                      <p className={styles.meta}>
                        <IconStar className={styles.star} /> Best first-try accuracy {Math.round(record.bestAccuracy * 100)}
                        % · replays earn half XP
                      </p>
                    )}
                  </div>
                  <Button
                    variant={record ? 'secondary' : 'primary'}
                    onClick={() => (inProgress ? onResume() : onOpenLesson(lesson.id))}
                    aria-label={`${inProgress ? 'Continue' : record ? 'Practise again' : 'Start'}: ${lesson.title}`}
                  >
                    {inProgress ? 'Continue' : record ? 'Practise' : 'Start'}
                  </Button>
                </li>
              );
            })}
          </ol>
        </section>

        <section className={styles.review}>
          <div>
            <h2 className={styles.sectionTitle}>Review</h2>
            <p className={styles.lessonText}>
              {progress.learned.length >= MIN_REVIEW_SIGNS
                ? `Mix up to 6 of the ${progress.learned.length} signs you’ve learned.`
                : `Finish a lesson to unlock review (needs ${MIN_REVIEW_SIGNS} learned signs).`}
            </p>
          </div>
          <Button variant="secondary" onClick={onReview} disabled={progress.learned.length < MIN_REVIEW_SIGNS}>
            Review
          </Button>
        </section>

        <section className={styles.how} aria-labelledby="how-heading">
          <h2 id="how-heading" className={styles.sectionTitle}>
            How it works
          </h2>
          <ol className={styles.steps}>
            <li>
              <strong>Watch.</strong> Every sign is demonstrated by Deaf signers from the PopSign ASL dataset.
            </li>
            <li>
              <strong>Sign.</strong> MediaPipe tracks your hands and face in the browser.{' '}
              <IconCamera className={styles.inline} /> Your video never leaves this device: only landmark coordinates
              are sent for recognition.
            </li>
            <li>
              <strong>Get feedback.</strong> A model trained on 250 everyday signs (Google’s ASL Signs competition
              winner) checks whether your sign matches. It recognises the sign as a whole; it can’t grade handshape
              details, so use the demo to self-correct.
            </li>
          </ol>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>
          Sign videos: <a href={attribution.url}>{attribution.dataset}</a>, {attribution.creators}, licensed{' '}
          <a href={attribution.licenseUrl}>{attribution.license}</a>. {attribution.changes} Recognition model:{' '}
          <a href="https://huggingface.co/sign/kaggle-asl-signs-1st-place">kaggle-asl-signs-1st-place</a> (MIT).
        </p>
        {confirmReset ? (
          <span className={styles.reset}>
            Erase all XP and progress on this device?
            <Button
              variant="danger"
              onClick={() => {
                onReset();
                setConfirmReset(false);
              }}
            >
              Erase
            </Button>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmReset(true)}>
            Reset progress
          </Button>
        )}
      </footer>
    </div>
  );
}
