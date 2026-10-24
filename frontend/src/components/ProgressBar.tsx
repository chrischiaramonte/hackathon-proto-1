import styles from './ProgressBar.module.css';

interface Props {
  value: number;
  max: number;
  label: string;
  tone?: 'brand' | 'success' | 'warning';
}

export function ProgressBar({ value, max, label, tone = 'success' }: Props) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={styles.track} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className={`${styles.fill} ${styles[tone]}`} style={{ width: `${percent}%` }} />
    </div>
  );
}
