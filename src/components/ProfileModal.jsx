import React, { useState } from 'react';
import { UserRound, X, AlertCircle } from 'lucide-react';
import { saveProfile } from '../lib/session';

// The name and title that go out in scripts and signatures belong to the person using the
// account, so they are editable here. Role and permissions are not shown as editable: those
// stay with the admin.
export default function ProfileModal({ user, onClose, onSaved }) {
  const [name, setName] = useState(user.name || '');
  const [title, setTitle] = useState(user.title && user.title !== user.role ? user.title : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      const updated = await saveProfile({ name, title });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xl p-4">
      <div className="w-full max-w-md glass-strong overflow-hidden">
        <div className="p-5 border-b border-[var(--glass-border)] bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold flex items-center gap-2">
              <UserRound className="w-4 h-4" /> My profile
            </h3>
            <p className="text-xs text-indigo-100 mt-0.5">{user.email} · {user.role}</p>
          </div>
          <button type="button" onClick={onClose} className="text-indigo-100 hover:text-white" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
              Display name
            </label>
            <input
              type="text"
              required
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Seif Amr"
              className="w-full px-3 py-2.5 glass-input rounded-xl text-sm"
            />
            <p className="text-[11px] text-muted mt-1.5">
              This is the name customers see: "my name is {name || '…'}" in scripts and in the email signature.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
              Outreach title
            </label>
            <input
              type="text"
              maxLength={40}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={user.role || 'Sales Agent'}
              className="w-full px-3 py-2.5 glass-input rounded-xl text-sm"
            />
            <p className="text-[11px] text-muted mt-1.5">
              Printed under your name in emails, e.g. Founder or Account Manager. Leave it blank to use your role, {user.role}.
            </p>
          </div>

          {error && (
            <p className="text-[11px] text-rose-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-sm font-semibold text-muted hover:text-[var(--text-primary)] border border-[var(--glass-border)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-600/30 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
