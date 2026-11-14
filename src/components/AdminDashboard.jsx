import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  UserPlus,
  Shield,
  Check,
  X,
  Lock,
  UserCheck,
  Settings,
  Database,
  UserX,
  UserCheck2,
  Edit3,
  Trash2,
  Copy,
  KeyRound,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { listStaff, createStaff, resetStaffPassword, setStaffStatus, updateStaff } from '../lib/staff';

export default function AdminDashboard({ currentUser, onClearDatabase }) {
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);

  // Accounts live on the server, so the screen reads them instead of keeping its own copy
  const [users, setUsers] = useState([]);
  const [storage, setStorage] = useState('persistent');
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [busyEmail, setBusyEmail] = useState('');
  const [creating, setCreating] = useState(false);
  // Shown once: the temporary password the admin hands to the employee
  const [handover, setHandover] = useState(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await listStaff();
      setUsers(data.users || []);
      setStorage(data.storage || 'persistent');
      setActionError('');
    } catch (err) {
      setActionError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const runAction = async (email, work) => {
    setBusyEmail(email);
    setActionError('');
    try {
      await work();
      await refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyEmail('');
    }
  };

  const [editingUser, setEditingUser] = useState(null);
  const [editNameInput, setEditNameInput] = useState('');
  const [editEmailInput, setEditEmailInput] = useState('');

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    role: 'Sales Agent',
    permissions: {
      leads: true,
      dialler: true,
      analytics: false,
      followups: true,
      admin: false
    }
  });

  const handlePermissionToggle = (user, permKey) => {
    if (busyEmail) return;
    runAction(user.email, () =>
      updateStaff(user.email, { permissions: { ...user.permissions, [permKey]: !user.permissions[permKey] } })
    );
  };

  const handleStatusToggle = (user) => {
    if (busyEmail) return;
    const nextStatus = user.status === 'Suspended' ? 'Active' : 'Suspended';
    runAction(user.email, () => setStaffStatus(user.email, nextStatus));
  };

  const handleResetPassword = (user) => {
    if (busyEmail) return;
    if (!window.confirm(`Issue a new temporary password for ${user.name}? Their current password stops working immediately.`)) return;
    runAction(user.email, async () => {
      const result = await resetStaffPassword(user.email);
      setCopied(false);
      setHandover({ name: user.name, email: user.email, password: result.tempPassword });
    });
  };

  const handleEditUserSubmit = async (e) => {
    e.preventDefault();
    if (!editingUser || !editNameInput) return;

    try {
      await updateStaff(editingUser.email, { name: editNameInput });
      setEditingUser(null);
      setEditNameInput('');
      setEditEmailInput('');
      await refresh();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email) return;

    setCreating(true);
    setActionError('');
    try {
      const result = await createStaff({
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        permissions: newUser.permissions
      });
      setIsAddUserModalOpen(false);
      setCopied(false);
      setHandover({ name: result.user.name, email: result.user.email, password: result.tempPassword });
      await refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const closeAddUser = () => {
    setIsAddUserModalOpen(false);
    setActionError('');
    setNewUser({
      name: '',
      email: '',
      role: 'Sales Agent',
      permissions: {
        leads: true,
        dialler: true,
        analytics: false,
        followups: true,
        admin: false
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center">
            <ShieldAlert className="w-7 h-7 mr-2 text-rose-600" />
            Admin Control & Access Management
          </h1>
          <p className="text-sm text-muted mt-1">
            Create staff accounts here. Each new account gets a one-time temporary password that the employee must replace the first time they sign in.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onClearDatabase}
            className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl shadow-md transition-all flex items-center space-x-2 text-sm"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear Database (Fresh Start)</span>
          </button>
          <button
            onClick={() => setIsAddUserModalOpen(true)}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl shadow-md transition-all flex items-center space-x-2 text-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create New Account</span>
          </button>
        </div>
      </div>

      {/* Security Notice */}
      <div className="p-4 accent-pill rounded-2xl border border-blue-200 dark:border-blue-900 flex items-start space-x-3 text-xs text-blue-800 dark:text-blue-300">
        <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <strong>Admin Privilege Center:</strong> You can wipe all leads, call logs, and follow-up tasks via the <strong>Clear Database</strong> button to operate fresh on the system.
        </div>
      </div>

      {storage === 'memory' && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-400/30 bg-amber-500/10 text-xs font-medium text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" />
          <span>
            Accounts created here are held in memory only: they disappear when the server restarts or redeploys.
            Set DATABASE_URL to keep them.
          </span>
        </div>
      )}

      {actionError && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-rose-400/30 bg-rose-500/10 text-xs font-medium text-rose-500">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Users Table */}
      <div className="glass overflow-hidden">
        <div className="p-5 border-b border-[var(--glass-border)] flex items-center justify-between">
          <h3 className="font-bold text-[var(--text-primary)] text-base">Authorized Staff & Credentials ({users.length})</h3>
          <span className="text-xs text-muted">Security & Permissions Control</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="glass-head text-xs font-semibold uppercase tracking-wider text-muted">
                <th className="py-3 px-4">User Name & Email</th>
                <th className="py-3 px-4">Role & Status</th>
                <th className="py-3 px-4 text-center">Leads Gen</th>
                <th className="py-3 px-4 text-center">The Dialler</th>
                <th className="py-3 px-4 text-center">Analytics</th>
                <th className="py-3 px-4 text-center">Follow-ups</th>
                <th className="py-3 px-4 text-center">Admin</th>
                <th className="py-3 px-4 text-right">Security & Profile Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07] text-sm">
              {loading && (
                <tr>
                  <td colSpan={8} className="py-6 px-4 text-center text-sm text-muted">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading accounts…
                  </td>
                </tr>
              )}
              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 px-4 text-center text-sm text-muted">
                    No staff accounts yet. Use <strong>Create New Account</strong> to add one.
                  </td>
                </tr>
              )}
              {users.map((user) => (
                <tr key={user.email} className={`row-hover ${user.status === 'Suspended' ? 'opacity-60 bg-red-50/30 dark:bg-red-950/10' : ''}`}>
                  <td className="py-4 px-4">
                    <div className="font-semibold text-[var(--text-primary)] flex items-center">
                      {user.name}
                      {user.email === currentUser?.email && (
                        <span className="ml-2 px-2 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 text-xs rounded-full font-semibold">You</span>
                      )}
                    </div>
                    <div className="text-xs text-muted">{user.email}</div>
                    {user.mustChangePassword && (
                      <div className="text-[10px] font-semibold text-amber-500 mt-1 inline-flex items-center gap-1">
                        <KeyRound className="w-3 h-3" /> Temporary password not yet replaced
                      </div>
                    )}
                  </td>
                  <td className="py-4 px-4 space-y-1">
                    <span className="px-2.5 py-0.5 glass-soft text-[var(--text-primary)]/80 rounded-full text-xs font-semibold inline-block">
                      {user.role}
                    </span>
                    <div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        user.status === 'Suspended' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}>
                        {user.status || 'Active'}
                      </span>
                    </div>
                  </td>

                  {/* Permission Toggles */}
                  {['leads', 'dialler', 'analytics', 'followups', 'admin'].map((permKey) => (
                    <td key={permKey} className="py-4 px-4 text-center">
                      <button
                        onClick={() => handlePermissionToggle(user, permKey)}
                        className={`p-1.5 rounded-lg transition-all ${
                          user.permissions[permKey]
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200'
                            : 'glass-soft text-muted hover:bg-white/15'
                        }`}
                        title={`Toggle ${permKey} permission`}
                      >
                        {user.permissions[permKey] ? <Check className="w-4 h-4 mx-auto" /> : <X className="w-4 h-4 mx-auto" />}
                      </button>
                    </td>
                  ))}

                  {/* Security & Profile Actions: Edit, Reset Pass, Suspend */}
                  <td className="py-4 px-4 text-right space-x-1 whitespace-nowrap">
                    <button
                      onClick={() => {
                        setEditingUser(user);
                        setEditNameInput(user.name);
                        setEditEmailInput(user.email);
                      }}
                      className="px-2.5 py-1.5 accent-pill text-blue-600 dark:text-blue-400 hover:bg-blue-100 rounded-lg text-xs font-medium transition-all inline-flex items-center space-x-1"
                      title="Edit Name / Username"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleResetPassword(user)}
                      disabled={busyEmail === user.email}
                      className="px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 rounded-lg text-xs font-medium transition-all inline-flex items-center space-x-1 disabled:opacity-50"
                      title="Issue a new temporary password"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Temp Password</span>
                    </button>
                    <button
                      onClick={() => handleStatusToggle(user)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all inline-flex items-center space-x-1 ${
                        user.status === 'Suspended'
                          ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-400'
                          : 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-400'
                      }`}
                      title={user.status === 'Suspended' ? 'Unsuspend Account' : 'Suspend Account'}
                    >
                      {user.status === 'Suspended' ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                      <span>{user.status === 'Suspended' ? 'Unsuspend' : 'Suspend'}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit User Details Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xl p-4">
          <div className="w-full max-w-md glass-strong overflow-hidden">
            <div className="p-6 border-b border-[var(--glass-border)] bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
              <h3 className="text-lg font-bold">Edit Employee Profile</h3>
              <p className="text-xs text-blue-100 mt-0.5">Update full name or username (email) for {editingUser.name}</p>
            </div>

            <form onSubmit={handleEditUserSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={editNameInput}
                  onChange={(e) => setEditNameInput(e.target.value)}
                  className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">Username / Email *</label>
                <input
                  type="email"
                  required
                  value={editEmailInput}
                  onChange={(e) => setEditEmailInput(e.target.value)}
                  className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-[var(--glass-border)]">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 glass-soft text-[var(--text-primary)]/80 rounded-xl text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium shadow-md"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xl p-4">
          <div className="w-full max-w-md glass-strong overflow-hidden">
            <div className="p-6 border-b border-[var(--glass-border)] bg-gradient-to-r from-rose-600 to-red-600 text-white">
              <h3 className="text-lg font-bold">Create New Staff Account</h3>
              <p className="text-xs text-rose-100 mt-0.5">Add a staff record. Sign-in accounts are managed on the server.</p>
            </div>

            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. David Miller"
                  value={newUser.name}
                  onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                  className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="david@sales.com"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">Role Title</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                  className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white"
                >
                  <option value="Admin">Admin</option>
                  <option value="Sales Agent">Sales Agent</option>
                  <option value="Follow-up Agent">Follow-up Agent</option>
                  <option value="Analyst">Analyst</option>
                </select>
              </div>

              <div className="space-y-2 pt-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted">Initial Sub-System Permissions</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.keys(newUser.permissions).map((key) => (
                    <label key={key} className="flex items-center space-x-2 text-xs font-medium text-[var(--text-primary)]/80">
                      <input
                        type="checkbox"
                        checked={newUser.permissions[key]}
                        onChange={(e) => setNewUser({
                          ...newUser,
                          permissions: { ...newUser.permissions, [key]: e.target.checked }
                        })}
                        className="rounded border-white/20 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="capitalize">{key}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-[var(--glass-border)]">
                <button
                  type="button"
                  onClick={closeAddUser}
                  className="px-4 py-2 glass-soft text-[var(--text-primary)]/80 rounded-xl text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium shadow-md disabled:opacity-70 inline-flex items-center gap-2"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  {creating ? 'Creating…' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Temporary password handover */}
      {handover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xl p-4">
          <div className="w-full max-w-md glass-strong overflow-hidden">
            <div className="p-6 border-b border-[var(--glass-border)] bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
              <h3 className="text-lg font-bold">Temporary password ready</h3>
              <p className="text-xs text-emerald-50 mt-0.5">
                Give this to {handover.name}. It is shown once and must be replaced at first sign-in.
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted mb-1">Email</div>
                <div className="font-mono text-sm text-[var(--text-primary)]">{handover.email}</div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted mb-1">Temporary password</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 rounded-xl glass-input font-mono text-sm tracking-wider text-[var(--text-primary)] select-all">
                    {handover.password}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(handover.password);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="p-2.5 glass-soft rounded-xl text-[var(--text-primary)]/80 hover:bg-white/15"
                    title="Copy password"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-muted leading-relaxed">
                The employee signs in with this password and is taken straight to a screen where they choose their own.
                If it is lost, issue a new one from the staff table.
              </p>

              <div className="flex justify-end pt-2 border-t border-[var(--glass-border)]">
                <button
                  onClick={() => setHandover(null)}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium shadow-md"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
