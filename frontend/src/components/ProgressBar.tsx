import styles from './ProgressBar.module.css';

interface Props {
  value: number;
  max: number;
  label: string;
  /** Read out instead of the raw number, e.g. "2 of 6". */
  valueText?: string;
  tone?: 'brand' | 'success' | 'warning';
}

export function ProgressBar({ value, max, label, valueText, tone = 'success' }: Props) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={styles.track} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={valueText ?? `${value} of ${max}`}>
      <div className={`${styles.fill} ${styles[tone]}`} style={{ width: `${percent}%` }} />
    </div>
  );
}
