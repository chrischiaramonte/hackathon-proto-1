import { useEffect, useId, useRef } from 'react';
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
  const id = useId();
  useEffect(() => buttonRef.current?.focus(), []);

  // Focus lands on Continue, which carries the result as its description, so screen
  // readers announce it once instead of racing a live region.
  return (
    <section className={`${styles.sheet} ${styles[tone]}`} aria-labelledby={`${id}-title`}>
      <div className={styles.inner}>
        <div className={styles.badge} aria-hidden="true">
          {tone === 'success' ? <IconCheck /> : <IconClose />}
        </div>
        <div className={styles.body}>
          <div className={styles.text}>
            <p id={`${id}-title`} className={styles.title}>
              {title}
            </p>
            {detail && (
              <p id={`${id}-detail`} className={styles.detail}>
                {detail}
              </p>
            )}
          </div>
          {xp ? (
            <span id={`${id}-xp`} className={styles.xp}>
              <IconBolt /> +{xp} XP
            </span>
          ) : null}
        </div>
        <Button
          ref={buttonRef}
          variant={tone}
          size="lg"
          onClick={onContinue}
          className={styles.continue}
          aria-describedby={[`${id}-title`, detail && `${id}-detail`, xp && `${id}-xp`].filter(Boolean).join(' ')}
        >
          Continue
        </Button>
      </div>
    </section>
  );
}
