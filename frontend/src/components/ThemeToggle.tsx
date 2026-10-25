import { useTheme } from '../lib/theme';
import { IconMoon, IconSun } from './Icons';
import styles from './ThemeToggle.module.css';

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className={styles.toggle} onClick={toggle} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      {theme === 'dark' ? <IconSun /> : <IconMoon />}
    </button>
  );
}
