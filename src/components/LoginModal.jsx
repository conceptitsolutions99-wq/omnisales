import React, { useState } from 'react';
import { Shield, ArrowRight, KeyRound, Ban, Sparkles, Globe } from 'lucide-react';

export default function LoginModal({ users, onLogin }) {
  const [selectedEmail, setSelectedEmail] = useState(users[0]?.email || 'admin@sales.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');

    const user = users.find(u => u.email === selectedEmail);
    if (!user) {
      setError('Selected account not found.');
      return;
    }

    if (user.status === 'Suspended') {
      setError('This account has been suspended by the administrator. Access denied.');
      return;
    }

    const expectedPassword = user.password || 'admin123';
    if (password !== expectedPassword) {
      setError('Incorrect password. Please verify your credentials.');
      return;
    }

    onLogin(user);
  };

  const selectedUser = users.find(u => u.email === selectedEmail);

  return (
    <div className="relative w-full max-w-[26rem] rise">
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-indigo-500/30 via-violet-500/20 to-cyan-400/25 blur-3xl pointer-events-none" />

      <div className="relative glass-strong overflow-hidden">
        {/* Brand header */}
        <div className="relative px-6 pt-8 pb-6 text-center">
          <div className="absolute inset-x-10 -top-24 h-40 bg-indigo-500/25 blur-3xl pointer-events-none" />
          <div className="relative mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-400 flex items-center justify-center shadow-xl shadow-indigo-600/40 mb-4">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">OmniSales</h1>
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
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted">
              Select account
            </label>
            <select
              value={selectedEmail}
              onChange={(e) => {
                setSelectedEmail(e.target.value);
                setPassword('');
                setError('');
              }}
              className="glass-input w-full px-3.5 py-3 text-sm font-medium"
            >
              {users.map((user) => (
                <option key={user.id} value={user.email} disabled={user.status === 'Suspended'}>
                  {user.name} ({user.role}) {user.status === 'Suspended' ? '[SUSPENDED]' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted">
              <span>Account password</span>
              {selectedUser && (
                <span className="font-mono text-[10px] normal-case tracking-normal accent-text">
                  demo · {selectedUser.password}
                </span>
              )}
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="password"
                required
                placeholder="Enter account password…"
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
            className="group w-full py-3 px-4 rounded-xl text-white font-semibold text-sm bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-600/35 hover:shadow-indigo-500/50 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
          >
            Secure sign in
            <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-0.5 transition-transform" />
          </button>

          <p className="text-center text-[11px] text-muted pt-1">
            Passwords &amp; suspension controls are managed by your administrator.
          </p>
        </form>
      </div>
    </div>
  );
}
