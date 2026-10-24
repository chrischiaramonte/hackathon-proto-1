import { signLabel } from '../content';
import type { Prediction } from '../lib/api';
import styles from './ModelGuesses.module.css';

interface Props {
  predictions: Prediction[];
  target: string;
}

/** The recogniser's actual top guesses out of 250 signs, shown as-is. */
export function ModelGuesses({ predictions, target }: Props) {
  if (predictions.length === 0) return null;
  return (
    <div className={styles.guesses}>
      <p className={styles.title}>What the model saw</p>
      <ol className={styles.list}>
        {predictions.slice(0, 3).map((p) => (
          <li key={p.sign} className={p.sign === target ? styles.match : undefined}>
            <span className={styles.label}>{signLabel(p.sign)}</span>
            <span className={styles.bar}>
              <span style={{ width: `${Math.round(p.probability * 100)}%` }} />
            </span>
            <span className={styles.value}>{Math.round(p.probability * 100)}%</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
