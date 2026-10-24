import { useEffect, useRef } from 'react';
import { Button } from './Button';
import { IconBolt, IconCheck, IconClose } from './Icons';
import styles from './FeedbackSheet.module.css';

interface Props {
  tone: 'success' | 'danger';
  title: string;
  detail?: string;
  xp?: number;
  onContinue: () => void;
}

/** Bottom sheet after each question. Enter (or the button) continues. */
export function FeedbackSheet({ tone, title, detail, xp, onContinue }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => buttonRef.current?.focus(), []);

  return (
    <div className={`${styles.sheet} ${styles[tone]}`} role="alert">
      <div className={styles.inner}>
        <div className={styles.badge} aria-hidden="true">
          {tone === 'success' ? <IconCheck /> : <IconClose />}
        </div>
        <div className={styles.text}>
          <p className={styles.title}>{title}</p>
          {detail && <p className={styles.detail}>{detail}</p>}
        </div>
        {xp ? (
          <span className={styles.xp}>
            <IconBolt /> +{xp} XP
          </span>
        ) : null}
        <Button ref={buttonRef} variant={tone} size="lg" onClick={onContinue} className={styles.continue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
