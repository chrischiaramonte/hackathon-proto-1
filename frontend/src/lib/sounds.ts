// Short answer sounds, synthesised with the Web Audio API (no audio files to load or license).
// Sound is a bonus: everything it signals is also shown on screen.

let context: AudioContext | null = null;
/** When the wrong sound last played, so a rejection and time's up landing together sound once. */
let lastWrongAt = -Infinity;

function audio(): AudioContext | null {
  try {
    context ??= new AudioContext();
    // Browsers start the context suspended until the page has had a click; the learner
    // has always pressed "I'm ready" before an answer, so resuming here is allowed.
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null; // No Web Audio (old browser, test environment): stay silent.
  }
}

/** One soft note with a quick fade in and out, so it never clicks. */
function note(ac: AudioContext, frequency: number, start: number, duration: number, type: OscillatorType, peak: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** Right answer: a bright rising chime (E5 then B5). */
export function playCorrect() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  note(ac, 659.25, t, 0.18, 'sine', 0.2);
  note(ac, 987.77, t + 0.09, 0.35, 'sine', 0.2);
}

/**
 * Wrong answer: a falling two-note "uh-oh" (E4 then C4), not a harsh buzzer. Pitched
 * above ~250 Hz because laptop speakers barely reproduce anything lower.
 */
export function playWrong() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  if (t - lastWrongAt < 1.5) return;
  lastWrongAt = t;
  note(ac, 329.63, t, 0.16, 'triangle', 0.32);
  note(ac, 261.63, t + 0.14, 0.3, 'triangle', 0.32);
}

/** Lesson complete: a quick rising arpeggio (C5 E5 G5) that lands on a held C6. */
export function playComplete() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  note(ac, 523.25, t, 0.16, 'sine', 0.18);
  note(ac, 659.25, t + 0.11, 0.16, 'sine', 0.18);
  note(ac, 783.99, t + 0.22, 0.16, 'sine', 0.18);
  note(ac, 1046.5, t + 0.33, 0.7, 'sine', 0.2);
  note(ac, 523.25, t + 0.33, 0.7, 'triangle', 0.08);
}
