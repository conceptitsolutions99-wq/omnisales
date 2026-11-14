import React, { useCallback, useEffect, useState } from 'react';
import { X, RefreshCw, CheckCircle2, XCircle, Settings, Mail, MailOpen, MapPin } from 'lucide-react';
import { hasGeoapifyKey } from '../lib/leads';

const IDLE = { state: 'loading', detail: '' };

const StatusPill = ({ state }) => {
  if (state === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-400/15 text-emerald-300">
        <CheckCircle2 className="w-3 h-3" /> Ready
      </span>
    );
  }
  if (state === 'loading') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/10 text-muted">
        Checking…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-400/15 text-rose-300">
      <XCircle className="w-3 h-3" /> Missing
    </span>
  );
};

const Row = ({ icon: Icon, title, description, status, fix }) => (
  <div className="rounded-xl border border-white/10 glass-soft p-3.5">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-white/[0.07] flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</div>
          <p className="text-[11px] text-muted mt-0.5">{description}</p>
          {status.detail && (
            <p className="text-[11px] mt-1 text-[var(--text-secondary)] break-words">{status.detail}</p>
          )}
          {status.state !== 'ok' && status.state !== 'loading' && fix && (
            <p className="text-[11px] mt-1.5 text-amber-300/90">{fix}</p>
          )}
        </div>
      </div>
      <StatusPill state={status.state} />
    </div>
  </div>
);

export default function SetupChecklist({ open, onClose }) {
  const [emailStatus, setEmailStatus] = useState(IDLE);
  const [replyStatus, setReplyStatus] = useState(IDLE);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    setEmailStatus(IDLE);
    setReplyStatus(IDLE);

    try {
      const response = await fetch('/api/emails');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Endpoint returned ${response.status}.`);
      setEmailStatus(
        data.configured
          ? { state: 'ok', detail: `Sending as ${data.sender || data.from || 'the configured account'}` }
          : { state: 'missing', detail: 'The endpoint answered, but no mail credentials were found.' }
      );
    } catch (err) {
      setEmailStatus({
        state: 'missing',
        detail: err.message === 'Failed to fetch' ? 'The API could not be reached from this page.' : err.message
      });
    }

    try {
      const response = await fetch('/api/replies?all=1');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Endpoint returned ${response.status}.`);
      setReplyStatus({
        state: 'ok',
        detail: `Reading the shared inbox · ${data.count || 0} ${data.count === 1 ? 'reply' : 'replies'} matched`
      });
    } catch (err) {
      setReplyStatus({
        state: 'missing',
        detail: err.message === 'Failed to fetch' ? 'The API could not be reached from this page.' : err.message
      });
    }

    setChecking(false);
  }, []);

  useEffect(() => {
    if (open) check();
  }, [open, check]);

  if (!open) return null;

  const geoapifyStatus = hasGeoapifyKey
    ? { state: 'ok', detail: 'Fallback key is present in this build.' }
    : { state: 'missing', detail: 'Lead search has no fallback when OpenStreetMap is busy.' };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-xl p-4 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-2xl glass-strong my-6">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <Settings className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-[var(--text-primary)] leading-tight">Setup status</h2>
              <p className="text-[11px] text-muted">What this deployment can and cannot do</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={check}
              disabled={checking}
              className="w-9 h-9 rounded-xl glass-soft flex items-center justify-center text-muted hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
              title="Run the checks again"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
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

        <div className="p-4 space-y-2.5">
          <Row
            icon={MapPin}
            title="Lead search fallback"
            description="Used when the free OpenStreetMap service is overloaded."
            status={geoapifyStatus}
            fix="Add VITE_GEOAPIFY_API_KEY to the environment, then rebuild — Vite bakes it in at build time."
          />

          <Row
            icon={Mail}
            title="Email sending"
            description="Outbound email through the shared Gmail account."
            status={emailStatus}
            fix="Add GMAIL_USER and GMAIL_APP_PASSWORD to the environment, then redeploy."
          />

          <Row
            icon={MailOpen}
            title="Reply tracking"
            description="Customer replies, matched to the agent who sent the original."
            status={replyStatus}
            fix="Reply tracking reuses the same Gmail credentials — fix email sending first."
          />
        </div>

        <div className="px-5 py-3 border-t border-white/10 text-[11px] text-muted">
          Checks run against the live endpoints each time this panel opens.
        </div>
      </div>
    </div>
  );
}
