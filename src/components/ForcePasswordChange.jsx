import React, { useState } from 'react';
import { ShieldCheck, KeyRound, Ban, Loader2, ArrowRight, LogOut } from 'lucide-react';
import { changePassword, signOut } from '../lib/session';

// Shown instead of the app when an account is still using an admin-issued temporary password.
export default function ForcePasswordChange({ user, onChanged, onSignOut }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) return setError('Choose a password of at least 8 characters.');
    if (newPassword !== confirmPassword) return setError('The two new passwords do not match.');

    setBusy(true);
    try {
      const updated = await changePassword(currentPassword, newPassword);
      onChanged(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    await signOut();
    onSignOut();
  };

  return (
    <div className="relative w-full max-w-[26rem] rise">
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-indigo-500/30 via-violet-500/20 to-cyan-400/25 blur-3xl pointer-events-none" />

      <div className="relative glass-strong overflow-hidden">
        <div className="px-6 pt-7 pb-5 border-b border-[var(--glass-border)]">
          <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest accent-pill px-2.5 py-1 rounded-full mb-3">
            <ShieldCheck className="w-3 h-3" /> First sign-in
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Choose your own password</h2>
          <p className="text-[12px] text-muted mt-1">
            {user?.name || 'Your account'} is still using the temporary password from your administrator.
            Replace it to open the workspace.
          </p>
        </div>

        <form onSubmit={submit} className="px-6 py-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted">Temporary password</label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="The one you just signed in with"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="glass-input w-full pl-10 pr-4 py-3 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted">New password</label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="glass-input w-full pl-10 pr-4 py-3 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted">Confirm new password</label>
            <div className="relative">
              <ShieldCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="password"
                required
                autoComplete="new-password"
                placeholder="Type it again"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="glass-input w-full pl-10 pr-4 py-3 text-sm"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl border border-rose-400/30 bg-rose-500/10 text-[11px] font-medium text-rose-300">
              <Ban className="w-4 h-4 flex-shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="group w-full py-3 px-4 rounded-xl text-white font-semibold text-sm bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-600/35 hover:shadow-indigo-500/50 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {busy ? 'Saving…' : 'Save and continue'}
            {!busy && <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-0.5 transition-transform" />}
          </button>

          <button
            type="button"
            onClick={leave}
            className="w-full text-[11px] text-muted hover:text-[var(--text-primary)] transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-3 h-3" /> Sign out instead
          </button>
        </form>
      </div>
    </div>
  );
}
