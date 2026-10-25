import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';

interface Props { onSubmit: (name: string, password: string, register: boolean) => Promise<void>; onGuest: () => void }
export function AccountAccess({ onSubmit, onGuest }: Props) {
  const [register, setRegister] = useState(true);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await onSubmit(name.trim(), password, register); } catch (err) { setError(err instanceof Error ? err.message : 'Could not sign in'); }
    finally { setBusy(false); }
  };
  return <main style={{ maxWidth: 440, margin: '10vh auto', padding: 24, background: 'var(--surface)', borderRadius: 24, boxShadow: 'var(--shadow)' }}>
    <Logo /><h1 style={{ marginTop: 24 }}>{register ? 'Create your account' : 'Welcome back'}</h1>
    <p style={{ margin: '8px 0 20px', color: 'var(--ink-2)' }}>Accounts earn server-verified leaderboard XP. Your rank stays hidden unless you opt in; lesson history remains on this device.</p>
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      <label>Display name<input required minLength={2} maxLength={24} pattern="[\w -]+" autoComplete="username" value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></label>
      <label>Password<input required minLength={10} maxLength={128} type="password" autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} /></label>
      {register && <small>Use at least 10 characters. Password recovery is not available yet.</small>}
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      <Button type="submit" size="lg" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</Button>
    </form>
    <p style={{ marginTop: 16 }}>{register ? 'Already have an account?' : 'New to SignSpark?'}{' '}
      <button type="button" onClick={() => { setRegister(!register); setError(''); }}> {register ? 'Sign in' : 'Create account'}</button>
    </p>
    <Button variant="ghost" onClick={onGuest}>Continue without an account</Button>
  </main>;
}
const inputStyle = { display: 'block', width: '100%', marginTop: 4, padding: 12, border: '2px solid var(--line)', borderRadius: 12, background: 'var(--surface)', color: 'var(--ink)', font: 'inherit' };
