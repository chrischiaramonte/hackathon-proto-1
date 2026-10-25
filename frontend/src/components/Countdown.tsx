import { useEffect, useState } from 'react';
import { ProgressBar } from './ProgressBar';

interface Props {
  startedAt: number;
  durationMs: number;
}

/** Time left to sign. JS-driven so it keeps working with reduced motion. */
export function Countdown({ startedAt, durationMs }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, durationMs - (now - startedAt));
  const seconds = Math.ceil(left / 1000);
  return (
    <ProgressBar
      value={left}
      max={durationMs}
      label="Time left to sign"
      valueText={`${seconds} seconds left`}
      tone={left < 5000 ? 'warning' : 'brand'}
    />
  );
}
