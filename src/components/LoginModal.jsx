import React, { useState } from 'react';
import { Shield, Lock, Mail, ArrowRight, UserCheck, KeyRound, Ban } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white text-center relative">
          <div className="mx-auto w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mb-3 backdrop-blur-md border border-white/20">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">OmniSales IT Pro</h1>
          <p className="text-blue-100 text-sm mt-1">Secure Outbound Sales & IT Solutions System</p>
        </div>

        <form onSubmit={handleLogin} className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Select Account
            </label>
            <select
              value={selectedEmail}
              onChange={(e) => {
                setSelectedEmail(e.target.value);
                setPassword('');
                setError('');
              }}
              className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {users.map((user) => (
                <option key={user.id} value={user.email} disabled={user.status === 'Suspended'}>
                  {user.name} ({user.role}) {user.status === 'Suspended' ? '[SUSPENDED]' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Account Password</span>
              {selectedUser && (
                <span className="text-blue-600 dark:text-blue-400 font-mono text-[11px]">
                  Demo Pass: {selectedUser.password}
                </span>
              )}
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type="password"
                required
                placeholder="Enter account password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-600 dark:text-red-300 font-medium flex items-center space-x-2">
              <Ban className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center space-x-2"
          >
            <span>Secure Sign In</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="text-center pt-2">
            <p className="text-xs text-slate-400">
              Protected access: Passwords & suspension controls managed by Admin.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
