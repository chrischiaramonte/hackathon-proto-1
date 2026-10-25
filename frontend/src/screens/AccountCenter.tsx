import { Button } from '../components/Button';
import type { AccountProfile } from '../lib/accountApi';

interface Props { account: AccountProfile; onClose: () => void; onSignOut: () => void }
export function AccountCenter({ account, onClose, onSignOut }: Props) {
  return <div role="dialog" aria-modal="true" aria-labelledby="account-title" style={overlay}>
    <section style={card}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><div><h2 id="account-title">{account.displayName}</h2><p>{account.xp} leaderboard XP</p></div><Button variant="ghost" onClick={onClose}>Close</Button></header>
      <footer style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, marginTop: 20 }}><Button variant="secondary" onClick={onSignOut}>Sign out</Button></footer>
    </section>
  </div>;
}
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 20, background: 'rgb(10 12 30 / 60%)', display: 'grid', placeItems: 'center', padding: 16 };
const card: React.CSSProperties = { width: 'min(100%, 560px)', maxHeight: '90vh', overflow: 'auto', background: 'var(--surface)', color: 'var(--ink)', padding: 24, borderRadius: 24, boxShadow: 'var(--shadow)' };
