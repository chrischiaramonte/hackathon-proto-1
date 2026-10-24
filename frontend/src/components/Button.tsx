import type { ComponentProps } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';

interface Props extends ComponentProps<'button'> {
  variant?: Variant;
  size?: 'md' | 'lg';
  block?: boolean;
}

export function Button({ variant = 'primary', size = 'md', block = false, className, ...props }: Props) {
  const classes = [styles.button, styles[variant], styles[size], block && styles.block, className];
  return <button type="button" className={classes.filter(Boolean).join(' ')} {...props} />;
}
