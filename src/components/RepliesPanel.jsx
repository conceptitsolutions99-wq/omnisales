import React from 'react';
import { X, RefreshCw, MailOpen, Reply, User, AlertTriangle } from 'lucide-react';

const timeAgo = (value) => {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};

export default function RepliesPanel({ open, onClose, replies, loading, error, isAdmin, currentUser, onRefresh }) {
  if (!open) return null;

  const unread = replies.filter((reply) => reply.unread).length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-xl p-4 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-3xl glass-strong my-6">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <MailOpen className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-[var(--text-primary)] leading-tight">
                Customer replies
                {unread > 0 && (
                  <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 align-middle">
                    {unread} new
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-muted">
                {isAdmin ? 'Every reply across the team' : `Replies to email you sent, ${currentUser?.name || ''}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={loading}
              className="w-9 h-9 rounded-xl glass-soft flex items-center justify-center text-muted hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
              title="Check for new replies"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl glass-soft flex items-center justify-center text-muted hover:text-rose-400 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-4 flex items-start gap-2 p-3 rounded-xl border border-rose-400/30 bg-rose-500/10 text-[11px] font-medium text-rose-300">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-3 sm:p-4 space-y-2 max-h-[65vh] overflow-y-auto">
          {loading && replies.length === 0 && (
            <p className="text-center py-10 text-sm text-muted">Checking the inbox…</p>
          )}

          {!loading && replies.length === 0 && !error && (
            <p className="text-center py-10 text-sm text-muted">
              {isAdmin
                ? 'No customer replies yet. Replies appear here as soon as someone answers an outreach email.'
                : 'No replies to your emails yet.'}
            </p>
          )}

          {replies.map((reply) => (
            <div
              key={reply.id}
              className={`rounded-xl border p-3.5 transition-colors ${
                reply.unread ? 'border-indigo-400/40 bg-indigo-500/[0.08]' : 'border-white/10 glass-soft'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Reply className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="font-semibold text-[13px] text-[var(--text-primary)] truncate">
                      {reply.fromName}
                    </span>
                    <span className="text-[11px] text-muted font-mono truncate">{reply.from}</span>
                  </div>
                  <p className="mt-1 text-[13px] text-[var(--text-secondary)] truncate" title={reply.subject}>
                    {reply.subject || '(no subject)'}
                  </p>
                  {reply.leadName && (
                    <p className="mt-0.5 text-[11px] text-muted">Lead: {reply.leadName}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] text-muted whitespace-nowrap">{timeAgo(reply.receivedAt)}</div>
                  {isAdmin && (
                    <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full accent-pill">
                      <User className="w-2.5 h-2.5" />
                      {reply.agent || 'Unassigned'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-white/10 text-[11px] text-muted">
          Replies are read from {isAdmin ? 'the shared inbox' : 'your sent threads'} · refreshed every two minutes
        </div>
      </div>
    </div>
  );
}
