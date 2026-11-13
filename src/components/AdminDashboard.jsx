import React, { useState } from 'react';
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
  KeyRound,
  UserX,
  UserCheck2,
  Edit3,
  Trash2
} from 'lucide-react';

export default function AdminDashboard({ users, setUsers, currentUser, onClearDatabase }) {
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [passwordResetUser, setPasswordResetUser] = useState(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');

  const [editingUser, setEditingUser] = useState(null);
  const [editNameInput, setEditNameInput] = useState('');
  const [editEmailInput, setEditEmailInput] = useState('');

  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Sales Agent',
    permissions: {
      leads: true,
      dialler: true,
      analytics: false,
      followups: true,
      admin: false
    }
  });

  const handlePermissionToggle = (userId, permKey) => {
    const updated = users.map(u => {
      if (u.id === userId) {
        return {
          ...u,
          permissions: {
            ...u.permissions,
            [permKey]: !u.permissions[permKey]
          }
        };
      }
      return u;
    });
    setUsers(updated);
  };

  const handleStatusToggle = (userId) => {
    const updated = users.map(u => {
      if (u.id === userId) {
        const nextStatus = u.status === 'Suspended' ? 'Active' : 'Suspended';
        return { ...u, status: nextStatus };
      }
      return u;
    });
    setUsers(updated);
  };

  const handlePasswordResetSubmit = (e) => {
    e.preventDefault();
    if (!passwordResetUser || !newPasswordInput) return;

    const updated = users.map(u => {
      if (u.id === passwordResetUser.id) {
        return { ...u, password: newPasswordInput };
      }
      return u;
    });

    setUsers(updated);
    setPasswordResetUser(null);
    setNewPasswordInput('');
  };

  const handleEditUserSubmit = (e) => {
    e.preventDefault();
    if (!editingUser || !editNameInput || !editEmailInput) return;

    const updated = users.map(u => {
      if (u.id === editingUser.id) {
        return { ...u, name: editNameInput, email: editEmailInput };
      }
      return u;
    });

    setUsers(updated);
    setEditingUser(null);
    setEditNameInput('');
    setEditEmailInput('');
  };

  const handleAddUser = (e) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email || !newUser.password) return;

    const userToAdd = {
      id: Date.now(),
      ...newUser,
      status: 'Active'
    };

    setUsers([...users, userToAdd]);
    setIsAddUserModalOpen(false);
    setNewUser({
      name: '',
      email: '',
      password: '',
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
            Full admin control: Manage staff credentials, reset passwords, suspend accounts, and clear database for a fresh start.
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
              {users.map((user) => (
                <tr key={user.id} className={`row-hover ${user.status === 'Suspended' ? 'opacity-60 bg-red-50/30 dark:bg-red-950/10' : ''}`}>
                  <td className="py-4 px-4">
                    <div className="font-semibold text-[var(--text-primary)] flex items-center">
                      {user.name}
                      {user.id === currentUser.id && (
                        <span className="ml-2 px-2 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 text-xs rounded-full font-semibold">You</span>
                      )}
                    </div>
                    <div className="text-xs text-muted">{user.email}</div>
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
                        onClick={() => handlePermissionToggle(user.id, permKey)}
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
                      onClick={() => setPasswordResetUser(user)}
                      className="px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 rounded-lg text-xs font-medium transition-all inline-flex items-center space-x-1"
                      title="Reset Password"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Reset Pass</span>
                    </button>
                    <button
                      onClick={() => handleStatusToggle(user.id)}
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

      {/* Password Reset Modal */}
      {passwordResetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xl p-4">
          <div className="w-full max-w-md glass-strong overflow-hidden">
            <div className="p-6 border-b border-[var(--glass-border)] bg-gradient-to-r from-indigo-600 to-blue-600 text-white">
              <h3 className="text-lg font-bold">Reset Password</h3>
              <p className="text-xs text-indigo-100 mt-0.5">Set a new secure password for {passwordResetUser.name}</p>
            </div>

            <form onSubmit={handlePasswordResetSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">New Password *</label>
                <input
                  type="text"
                  required
                  placeholder="Enter new password..."
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white font-mono"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-[var(--glass-border)]">
                <button
                  type="button"
                  onClick={() => {
                    setPasswordResetUser(null);
                    setNewPasswordInput('');
                  }}
                  className="px-4 py-2 glass-soft text-[var(--text-primary)]/80 rounded-xl text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium shadow-md"
                >
                  Update Password
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
              <p className="text-xs text-rose-100 mt-0.5">Provision account credentials and access passwords</p>
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
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">Account Password *</label>
                <input
                  type="password"
                  required
                  placeholder="Set secure password..."
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white font-mono"
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
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="px-4 py-2 glass-soft text-[var(--text-primary)]/80 rounded-xl text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium shadow-md"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
