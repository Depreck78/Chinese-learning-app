import { Check, CloudCheck, CloudOff, LogOut, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AvatarBadge } from './avatar-badge';
import { AVATARS, type AvatarId } from './avatars';
import { hasProgress } from './progress';
import type { useSyncedProgress } from './use-synced-progress';

type Account = ReturnType<typeof useSyncedProgress>;

function timeAgo(at: number) {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : new Date(at).toLocaleDateString();
}

export function AccountPanel({ account, online, learnedCount }: { account: Account; online: boolean; learnedCount: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [profileMessage, setProfileMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const { session, status } = account;

  async function saveProfile(changes: { username?: string; avatar?: AvatarId }, done: string) {
    setBusy(true);
    setProfileMessage(null);
    try {
      await account.updateProfile(changes);
      setProfileMessage({ kind: 'ok', text: done });
      if (changes.username) setNewUsername('');
    } catch (failure) {
      setProfileMessage({ kind: 'error', text: (failure as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function removeAccount() {
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy(true);
    try {
      await account.deleteAccount();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  const statusText = status.state === 'synced' ? `Synced ${timeAgo(status.at)}`
    : status.state === 'syncing' ? 'Syncing…'
      : status.state === 'error' ? status.message
        : online ? 'Waiting to sync' : 'Offline — changes will sync when you reconnect';

  return (
    <section className="page-main account-page">
      <header className="page-heading">
        <div><span className="label">YOUR PROGRESS</span><h1>Account</h1></div>
        <p>Each account keeps its own progress, saved on this device so it works offline. Signed in, it syncs with your other phones and computers whenever you’re online.</p>
        <p className="account-privacy">To see how the app is used, it records the minutes you study and the characters you learn each day, linked to your account once you sign in. Nothing else you type or write is included.</p>
      </header>

      {session ? (
        <div className="account-card">
          <div className="account-identity"><AvatarBadge avatar={session.avatar} size={56} /><div><span className="label">SIGNED IN AS</span><strong>{session.username}</strong></div></div>
          <p className={`account-status ${status.state}`} aria-live="polite">{status.state === 'synced' ? <CloudCheck size={18} /> : <CloudOff size={18} />}{statusText}</p>
          <p className="account-note">{learnedCount.toLocaleString()} learned {learnedCount === 1 ? 'character' : 'characters'} on this device. Changes sync within a minute, when you leave the app, and whenever it opens with a connection.</p>
          <section className="account-profile" aria-labelledby="avatar-title">
            <h2 id="avatar-title" className="label">CHOOSE YOUR AVATAR</h2>
            <fieldset className="avatar-choices" disabled={busy || !online}>
              <legend className="sr-only">Avatar</legend>
              {AVATARS.map((avatar) => (
                <label key={avatar.id} className="avatar-choice">
                  <input type="radio" name="avatar" value={avatar.id} checked={session.avatar === avatar.id} onChange={() => void saveProfile({ avatar: avatar.id }, `Avatar changed to ${avatar.name.toLowerCase()}.`)} />
                  <AvatarBadge avatar={avatar.id} size={48} />
                  <span><b>{avatar.name}</b><small>{avatar.chinese} · {avatar.pinyin}</small></span>
                  {session.avatar === avatar.id && <Check className="avatar-selected" size={16} aria-hidden="true" />}
                </label>
              ))}
            </fieldset>
            <form className="username-form" onSubmit={(event) => { event.preventDefault(); void saveProfile({ username: newUsername.trim() }, 'Username changed.'); }}>
              <label className="account-field"><span>Change username</span><input value={newUsername} onChange={(event) => setNewUsername(event.target.value)} placeholder={session.username} autoComplete="username" autoCapitalize="off" autoCorrect="off" spellCheck={false} required minLength={3} maxLength={32} pattern="[A-Za-z0-9_.\-]+" /></label>
              <button className="account-secondary" type="submit" disabled={busy || !online || !newUsername.trim() || newUsername.trim() === session.username}>Save</button>
            </form>
            {profileMessage && <output className={profileMessage.kind === 'ok' ? 'account-ok' : 'account-error'}>{profileMessage.text}</output>}
            {!online && <p className="account-note">Connect to the internet to change your avatar or username.</p>}
          </section>
          <div className="account-actions">
            <button className="complete-day-button" onClick={() => void account.syncNow()} disabled={!online || status.state === 'syncing'}><RefreshCw size={17} />Sync now</button>
            <button className="account-secondary" onClick={() => void account.signOut()}><LogOut size={17} />Log out</button>
          </div>
          <p className="account-note">Logging out hides this account’s progress until you log in again. Nothing is lost.</p>
          <div className="account-danger">
            <button className="account-delete" onClick={() => void removeAccount()} disabled={busy || !online}><Trash2 size={16} />{confirmDelete ? 'Tap again to delete your account for good' : 'Delete account'}</button>
            {confirmDelete && <button className="account-secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>}
          </div>
          {error && <p className="account-error" role="alert">{error}</p>}
        </div>
      ) : (
        <SignInForm account={account} online={online} className="account-card" />
      )}
    </section>
  );
}

/**
 * Create an account or log in. With `keepProgress`, a new account always takes what was studied
 * on this device while signed out; otherwise the learner can choose to bring it along.
 */
export function SignInForm({ account, online, className, keepProgress = false }: { account: Account; online: boolean; className: string; keepProgress?: boolean }) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bringProgress, setBringProgress] = useState(false);
  // While signed out, `account.progress` is what was studied here without an account.
  const hasDeviceProgress = mode === 'register' && !account.session && hasProgress(account.progress);

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await account.signIn(mode, username.trim(), password, hasDeviceProgress && (keepProgress || bringProgress));
      setPassword('');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const registerNote = keepProgress && hasDeviceProgress ? 'At least 8 characters. What you’ve studied so far moves into your new account.' : 'At least 8 characters. A new account starts from Day 1.';
  return (
    <form className={className} onSubmit={(event) => void submit(event)}>
      <div className="account-switch" role="tablist" aria-label="Account">
        <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => { setMode('register'); setError(''); }}>Create account</button>
        <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setError(''); }}>Log in</button>
      </div>
      <label className="account-field"><span>Username</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoCapitalize="off" autoCorrect="off" spellCheck={false} required minLength={3} maxLength={32} pattern="[A-Za-z0-9_.\-]+" /></label>
      <label className="account-field"><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={8} maxLength={200} /></label>
      <p className="account-note">{mode === 'register' ? registerNote : 'You’ll pick up where this account left off on your other devices.'}</p>
      {hasDeviceProgress && !keepProgress && (
        <label className="account-check">
          <input type="checkbox" checked={bringProgress} onChange={(event) => setBringProgress(event.target.checked)} />
          <span>Bring the progress already on this device into the new account</span>
        </label>
      )}
      {account.signedOutNotice && !error && <p className="account-error" role="alert">{account.signedOutNotice}</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
      {!online && <p className="account-error">You’re offline. Connect to the internet to {mode === 'register' ? 'create your account' : 'log in'}.</p>}
      <button className="complete-day-button" type="submit" disabled={busy || !online}>{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Log in'}</button>
    </form>
  );
}
