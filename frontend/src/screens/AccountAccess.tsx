import { useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';

interface Props { onSubmit: (name: string, password: string, register: boolean) => Promise<void>; onGuest: () => void }
export function AccountAccess({ onSubmit, onGuest }: Props) {
  // Sign in is the default; "Create account" switches to sign-up.
  const [register, setRegister] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onGuest(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [onGuest]);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await onSubmit(name.trim(), password, register); } catch (err) { setError(err instanceof Error ? err.message : 'Could not sign in'); }
    finally { setBusy(false); }
  };
  const dismiss = (e: MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onGuest(); };
  return <div role="dialog" aria-modal="true" aria-labelledby="account-access-title" style={overlay} onClick={dismiss}>
    <main style={card}>
      <Logo /><h1 id="account-access-title" style={{ marginTop: 24 }}>{register ? 'Create your account' : 'Welcome back'}</h1>
      <p style={{ margin: '8px 0 20px', color: 'var(--ink-2)' }}>Accounts earn server-verified XP and a place on the leaderboard; lesson history remains on this device.</p>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label>Display name<input required minLength={2} maxLength={24} pattern="[\w -]+" autoComplete="username" value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></label>
        <label>Password<input required minLength={10} maxLength={128} type="password" autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} /></label>
        {register && <small>Use at least 10 characters. Password recovery is not available yet.</small>}
        {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
        <Button type="submit" size="lg" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</Button>
      </form>
      <p style={{ marginTop: 16 }}>{register ? 'Already have an account?' : 'New to cosign?'}{' '}
        <button type="button" onClick={() => { setRegister(!register); setError(''); }} style={linkButton}>{register ? 'Sign in' : 'Create account'}</button>
      </p>
      {/* No side padding: a text-only button lines up with the text above it. */}
      <Button variant="ghost" onClick={onGuest} style={{ paddingInline: 0 }}>Continue without an account</Button>
    </main>
  </div>;
}
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 20, background: 'rgb(10 12 30 / 60%)', display: 'grid', placeItems: 'center', padding: 16, overflow: 'auto' };
const card: React.CSSProperties = { width: 'min(100%, 440px)', maxHeight: '90vh', overflow: 'auto', margin: 'auto', background: 'var(--surface)', color: 'var(--ink)', padding: 24, borderRadius: 24, boxShadow: 'var(--shadow)' };
// The sign-in / sign-up switch reads as an inline link, not a boxed button.
const linkButton: React.CSSProperties = { padding: 0, border: 0, background: 'none', color: 'var(--brand-text)', font: 'inherit', fontWeight: 800, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' };
const inputStyle: React.CSSProperties = { display: 'block', width: '100%', marginTop: 4, padding: 12, border: '2px solid var(--line)', borderRadius: 12, background: 'var(--surface)', color: 'var(--ink)', font: 'inherit' };
