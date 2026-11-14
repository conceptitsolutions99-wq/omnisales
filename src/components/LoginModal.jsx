import React, { useState } from 'react';
import { ArrowRight, KeyRound, Ban, Sparkles, Globe, Mail, Loader2 } from 'lucide-react';

export default function LoginModal({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      await onLogin(email.trim(), password);
    } catch (err) {
      setError(err.message === 'Failed to fetch' ? 'Cannot reach the server. Check your connection and try again.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative w-full max-w-[26rem] rise">
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-indigo-500/30 via-violet-500/20 to-cyan-400/25 blur-3xl pointer-events-none" />

      <div className="relative glass-strong overflow-hidden">
        {/* Brand header */}
        <div className="relative px-6 pt-8 pb-6 text-center">
          <div className="absolute inset-x-10 -top-24 h-40 bg-indigo-500/25 blur-3xl pointer-events-none" />
          <h1 className="sr-only">Concept IT Solutions</h1>
          <img
            src="/logo.png"
            alt="Concept — Technology Company"
            className="relative mx-auto w-40 sm:w-44 rounded-2xl shadow-2xl shadow-blue-950/60 ring-1 ring-white/10 mb-4"
            onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = '/logo.svg'; }}
          />
          <p className="text-[13px] text-muted mt-1 inline-flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            Secure outbound sales &amp; IT solutions
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full accent-pill">
            <Globe className="w-2.5 h-2.5" /> Canada &amp; USA
          </div>
        </div>

        <form onSubmit={handleLogin} className="px-6 pb-7 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted">Work email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="email"
                required
                autoComplete="username"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="glass-input w-full pl-10 pr-4 py-3 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted">Password</label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="Enter your password…"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
            {busy ? 'Signing in…' : 'Secure sign in'}
            {!busy && <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-0.5 transition-transform" />}
          </button>

          <p className="text-center text-[11px] text-muted pt-1">
            Accounts are managed on the server. Ask your administrator for access.
          </p>
        </form>
      </div>
    </div>
  );
}
