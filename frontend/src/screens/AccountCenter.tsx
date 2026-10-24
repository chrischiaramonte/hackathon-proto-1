import { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { accountApi, type AccountProfile, type Friend, type LeaderboardRow } from '../lib/accountApi';

interface Props { account: AccountProfile; onClose: () => void; onAccountChange: (a: AccountProfile) => void; onSignOut: () => void; onDelete: () => void }
export function AccountCenter({ account, onClose, onAccountChange, onSignOut, onDelete }: Props) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [newFriend, setNewFriend] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    try { const [board, list] = await Promise.all([accountApi.leaderboard(), accountApi.friends()]); setRows(board); setFriends(list); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load leaderboard'); }
  };
  useEffect(() => { void refresh(); }, []);
  const updatePrivacy = async (visible: boolean, friendsOnly: boolean) => {
    setBusy(true); setError('');
    try { onAccountChange(await accountApi.privacy(visible, friendsOnly)); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save settings'); }
    finally { setBusy(false); }
  };
  const addFriend = async () => {
    setError('');
    try { await accountApi.requestFriend(newFriend.trim()); setNewFriend(''); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not add friend'); }
  };
  return <div role="dialog" aria-modal="true" aria-labelledby="account-title" style={overlay}>
    <section style={card}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><div><h2 id="account-title">{account.displayName}</h2><p>{account.xp} leaderboard XP</p></div><Button variant="ghost" onClick={onClose}>Close</Button></header>
      <h3 style={heading}>Leaderboard privacy</h3>
      <label style={line}><input type="checkbox" checked={account.leaderboardVisible} disabled={busy} onChange={e => void updatePrivacy(e.target.checked, false)} /> Show me on the leaderboard</label>
      <label style={line}><input type="checkbox" checked={account.friendsOnly} disabled={busy || !account.leaderboardVisible} onChange={e => void updatePrivacy(true, e.target.checked)} /> Friends only</label>
      {!account.leaderboardVisible && <p>Your rank is hidden. Your account XP is still saved.</p>}
      <h3 style={heading}>Friends</h3>
      <form onSubmit={e => { e.preventDefault(); void addFriend(); }} style={{ display: 'flex', gap: 8 }}>
        <input aria-label="Friend display name" value={newFriend} onChange={e => setNewFriend(e.target.value)} placeholder="Exact display name" style={input} />
        <Button type="submit" disabled={!newFriend.trim()}>Add</Button>
      </form>
      <ul style={{ paddingLeft: 20 }}>{friends.map(f => <li key={f.displayName} style={{ marginTop: 6 }}>
        {f.displayName} · {f.accepted ? 'friend' : f.incoming ? <button onClick={() => void accountApi.requestFriend(f.displayName).then(refresh)}>Accept request</button> : 'request sent'}
        {f.accepted && <button style={{ marginLeft: 8 }} onClick={() => void accountApi.removeFriend(f.displayName).then(refresh)}>Remove</button>}
      </li>)}</ul>
      {account.leaderboardVisible && <><h3 style={heading}>{account.friendsOnly ? 'Friends leaderboard' : 'Top learners'}</h3>
        {rows.length ? <ol style={{ maxHeight: 210, overflow: 'auto', paddingLeft: 28 }}>{rows.map(r => <li key={`${r.rank}-${r.displayName}`} style={{ fontWeight: r.you ? 900 : 600 }}>{r.displayName} — {r.xp} XP{r.you ? ' (you)' : ''}</li>)}</ol> : <p>No visible scores yet. Add a friend or opt in to appear here.</p>}
      </>}
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      <footer style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 20 }}><Button variant="secondary" onClick={onSignOut}>Sign out</Button><Button variant="danger" onClick={() => { if (window.confirm('Delete your account and all server XP history? This cannot be undone.')) onDelete(); }}>Delete account</Button></footer>
    </section>
  </div>;
}
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 20, background: 'rgb(10 12 30 / 60%)', display: 'grid', placeItems: 'center', padding: 16 };
const card: React.CSSProperties = { width: 'min(100%, 560px)', maxHeight: '90vh', overflow: 'auto', background: 'var(--surface)', color: 'var(--ink)', padding: 24, borderRadius: 24, boxShadow: 'var(--shadow)' };
const heading: React.CSSProperties = { marginTop: 22, marginBottom: 8 };
const line: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' };
const input: React.CSSProperties = { flex: 1, minWidth: 0, border: '2px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', borderRadius: 12, padding: 10, font: 'inherit' };
