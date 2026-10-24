import { useEffect, useRef } from 'react';
import { Button } from '../components/Button';
import { IconBolt, IconCheck, IconStar } from '../components/Icons';
import { signLabel } from '../content';
import type { LessonSummary } from '../lib/lessonEngine';
import styles from './CompleteScreen.module.css';

const CONFETTI_COLORS = ['#5a48f0', '#1fae6b', '#ffb400', '#ef4f57', '#38bdf8'];

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

interface Props {
  summary: LessonSummary;
  title: string;
  onDone: () => void;
  onReplay: () => void;
}

export function CompleteScreen({ summary, title, onDone, onReplay }: Props) {
  const doneRef = useRef<HTMLButtonElement>(null);
  useEffect(() => doneRef.current?.focus(), []);

  return (
    <div className={styles.page}>
      {summary.scored && (
        <div className={styles.confetti} aria-hidden="true">
          {Array.from({ length: 36 }, (_, i) => (
            <span
              key={i}
              style={{
                left: `${(i * 37) % 100}%`,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDelay: `${(i % 9) * 90}ms`,
                animationDuration: `${1600 + ((i * 53) % 900)}ms`,
              }}
            />
          ))}
        </div>
      )}

      <main className={styles.card}>
        <div className={styles.trophy} aria-hidden="true">
          <IconStar />
        </div>
        <p className={styles.kicker}>{title}</p>
        <h1 className={styles.title}>{summary.scored ? 'Lesson complete!' : 'Practice complete'}</h1>
        {!summary.scored && (
          <p className={styles.note}>Recognition was off, so this run wasn’t scored and earned no XP.</p>
        )}

        {summary.scored && (
          <div className={styles.stats}>
            <div className={`${styles.stat} ${styles.xp}`}>
              <span className={styles.statLabel}>XP earned</span>
              <span className={styles.statValue}>
                <IconBolt /> {summary.totalXp}
              </span>
              {summary.bonusXp > 0 && <span className={styles.statSub}>incl. +{summary.bonusXp} completion bonus</span>}
            </div>
            <div className={`${styles.stat} ${styles.accuracy}`}>
              <span className={styles.statLabel}>First try</span>
              <span className={styles.statValue}>{Math.round(summary.accuracy * 100)}%</span>
            </div>
            <div className={`${styles.stat} ${styles.time}`}>
              <span className={styles.statLabel}>Time</span>
              <span className={styles.statValue}>{formatDuration(summary.durationMs)}</span>
            </div>
          </div>
        )}

        <ul className={styles.signs} aria-label="Signs in this lesson">
          {summary.signs.map(({ sign, misses }) => (
            <li key={sign}>
              <IconCheck className={styles.check} />
              <span className={styles.signName}>{signLabel(sign)}</span>
              <span className={styles.misses}>
                {misses === 0 ? 'first try' : `after ${misses} ${misses === 1 ? 'miss' : 'misses'}`}
              </span>
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          <Button variant="secondary" size="lg" onClick={onReplay}>
            Practise again
          </Button>
          <Button ref={doneRef} variant="success" size="lg" onClick={onDone}>
            Continue
          </Button>
        </div>
      </main>
    </div>
  );
}
