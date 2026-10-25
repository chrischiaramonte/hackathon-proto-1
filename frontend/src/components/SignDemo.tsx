import { useEffect, useRef, useState } from 'react';
import type { Sign } from '../content';
import { IconPause, IconPlay, IconTurtle, IconUsers } from './Icons';
import styles from './SignDemo.module.css';

interface Props {
  sign: Sign;
  compact?: boolean;
}

/** Loops a real signer's demonstration of the sign. Render with key={sign.id}. */
export function SignDemo({ sign, compact = false }: Props) {
  const [clipIndex, setClipIndex] = useState(0);
  const [slow, setSlow] = useState(false);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const clip = sign.clips[clipIndex];
  const rate = slow ? 0.5 : 1;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.defaultPlaybackRate = rate;
    video.playbackRate = rate;
  }, [rate, clip]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (paused) video.pause();
    else video.play().catch(() => setPaused(true));
  }, [paused, clip]);

  return (
    <figure className={`${styles.demo} ${compact ? styles.compact : ''}`}>
      <div className={styles.frame}>
        {clip && !failed ? (
          <video
            key={clip.src}
            ref={videoRef}
            src={clip.src}
            autoPlay
            loop
            muted
            playsInline
            aria-label={`Demonstration of the sign for “${sign.label}”`}
            onLoadedData={(e) => {
              e.currentTarget.playbackRate = rate;
            }}
            onError={() => setFailed(true)}
          />
        ) : (
          <p className={styles.error}>This demonstration video could not be loaded. Check your connection and refresh.</p>
        )}
      </div>
      <div className={styles.controls}>
        <button type="button" className={styles.control} onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play demonstration' : 'Pause demonstration'}>
          {paused ? <IconPlay /> : <IconPause />}
        </button>
        <button
          type="button"
          className={styles.control}
          aria-pressed={slow}
          aria-label={compact ? 'Slow motion' : undefined}
          title="Slow motion"
          onClick={() => setSlow((s) => !s)}
        >
          <IconTurtle /> {compact ? '' : 'Slow'}
        </button>
        {sign.clips.length > 1 && (
          <button
            type="button"
            className={styles.control}
            aria-label={`Another signer (${clipIndex + 1}/${sign.clips.length})`}
            title="Show another signer"
            onClick={() => {
              setFailed(false);
              setClipIndex((i) => (i + 1) % sign.clips.length);
            }}
          >
            <IconUsers /> {compact ? `${clipIndex + 1}/${sign.clips.length}` : 'Another signer'}
          </button>
        )}
      </div>
      {!compact && (
        <figcaption className={styles.credit}>
          Signer {clipIndex + 1} of {sign.clips.length} · Deaf signer from PopSign ASL (CC BY 4.0)
        </figcaption>
      )}
    </figure>
  );
}
