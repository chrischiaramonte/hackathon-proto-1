import styles from './Logo.module.css';

const APP_NAME = 'SignSpark';

export function Logo() {
  return (
    <span className={styles.logo}>
      <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="var(--brand)" />
        <path
          d="M11 17V9.8a1.6 1.6 0 0 1 3.2 0V15m0-.5V8.2a1.6 1.6 0 0 1 3.2 0v6.3m0-.3V9.6a1.6 1.6 0 0 1 3.2 0V18a6.5 6.5 0 0 1-6.5 6.5h-.6A6.5 6.5 0 0 1 8 18.6v-3.4a1.5 1.5 0 0 1 3 0"
          fill="none"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M24.5 4.5l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9z" fill="var(--xp)" />
      </svg>
      {APP_NAME}
    </span>
  );
}
