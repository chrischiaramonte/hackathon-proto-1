import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { IconArrowRight, IconBolt, IconCamera, IconCheck, IconHand, IconStar } from '../components/Icons';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';
import { ProgressBar } from '../components/ProgressBar';
import { attribution, lessons, signLabel } from '../content';
import type { Progress } from '../lib/progress';
import styles from './Dashboard.module.css';
import { accountApi, type AccountProfile, type LeaderboardRow } from '../lib/accountApi';

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
  leaderboardRefresh: number;
}

export function Dashboard({ progress, activeTitle, onOpenLesson, onResume, onReview, onReset, account, onManageAccount, leaderboardRefresh }: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  // The reset button and its confirmation replace each other; keep focus with whichever is showing.
  const resetRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const resetTouched = useRef(false);
  useEffect(() => {
    if (resetTouched.current) (confirmReset ? cancelRef : resetRef).current?.focus();
  }, [confirmReset]);
  const showResetConfirm = (show: boolean) => {
    resetTouched.current = true;
    setConfirmReset(show);
  };
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState(false);
  const [manualRefresh, setManualRefresh] = useState(0);
  const next = lessons.find((lesson) => !progress.completed[lesson.id]);
  const active = progress.active;
  const completedCount = lessons.filter((lesson) => progress.completed[lesson.id]).length;

  useEffect(() => {
    if (!account) {
      setLeaderboard([]);
      setLeaderboardError(false);
      return;
    }
    let active = true;
    setLeaderboardLoading(true);
    setLeaderboardError(false);
    void accountApi.leaderboard()
      .then((rows) => { if (active) setLeaderboard(rows); })
      .catch(() => { if (active) setLeaderboardError(true); })
      .finally(() => { if (active) setLeaderboardLoading(false); });
    return () => { active = false; };
  }, [account?.id, account?.xp, account?.leaderboardVisible, account?.friendsOnly, leaderboardRefresh, manualRefresh]);

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
          <ThemeToggle />
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

        <section className={styles.leaderboard} aria-labelledby="leaderboard-heading">
          <div className={styles.leaderboardHeader}>
            <div>
              <p className={styles.leaderboardKicker}>Community</p>
              <h2 id="leaderboard-heading" className={styles.sectionTitle}>
                {account?.friendsOnly ? 'Friends leaderboard' : 'Leaderboard'}
              </h2>
            </div>
            {account && <Button variant="ghost" onClick={() => setManualRefresh((n) => n + 1)}>Refresh</Button>}
          </div>
          {!account ? (
            <div className={styles.leaderboardEmpty}>
              <p>Sign in to see the leaderboard. Your rank stays hidden until you opt in.</p>
              <Button variant="secondary" onClick={onManageAccount}>Sign in or create an account</Button>
            </div>
          ) : leaderboardLoading ? (
            <p className={styles.leaderboardEmpty} role="status">Loading leaderboard…</p>
          ) : leaderboardError ? (
            <p className={styles.leaderboardEmpty} role="alert">Couldn’t load the leaderboard. Try refreshing.</p>
          ) : leaderboard.length ? (
            <ol className={styles.leaderboardList}>
              {leaderboard.map((row) => (
                <li key={`${row.rank}-${row.displayName}`} className={`${styles.leaderboardRow} ${row.you ? styles.currentLearner : ''}`}>
                  <span className={styles.leaderboardRank}>{row.rank}</span>
                  <span className={styles.leaderboardName}>{row.displayName}{row.you ? ' (you)' : ''}</span>
                  <span className={styles.leaderboardXp}><IconBolt className={styles.bolt} /> {row.xp} XP</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className={styles.leaderboardEmpty}>
              <p>{account.friendsOnly
                ? 'No friends are on the leaderboard yet. Add friends from your account settings.'
                : account.leaderboardVisible
                  ? 'No learners have opted in yet. You’ll show up here when your score is ranked.'
                  : 'No ranked learners yet. Your score is private until you opt in.'}</p>
              <Button variant="secondary" onClick={onManageAccount}>Leaderboard settings</Button>
            </div>
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
                    aria-label={`${inProgress ? 'Continue' : record ? 'Practice again' : 'Start'}: ${lesson.title}`}
                  >
                    {inProgress ? 'Continue' : record ? 'Practice' : 'Start'}
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
                showResetConfirm(false);
              }}
            >
              Erase
            </Button>
            <Button ref={cancelRef} variant="ghost" onClick={() => showResetConfirm(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button ref={resetRef} variant="ghost" onClick={() => showResetConfirm(true)}>
            Reset progress
          </Button>
        )}
      </footer>
    </div>
  );
}
