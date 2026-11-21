import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Settings,
  Mail,
  MailOpen,
  MapPin,
  Bell,
  Gauge,
  ShieldAlert,
  UserX
} from 'lucide-react';
import { hasGeoapifyKey } from '../lib/leads';

const IDLE = { state: 'loading', detail: '' };

// Why a sign-in note was not sent, in words an admin can act on
const NOTIFY_REASONS = {
  disabled: 'sign-in notifications are turned off',
  'no-recipient': 'no notification address is set',
  'not-configured': 'SMTP is not configured',
  failed: 'the mail server refused it',
  unknown: 'the reason was not recorded'
};

// One row per kind of admin note: each is sent separately, so each can fail on its own while the
// others keep working. The endpoint reports the latest outcome of every kind it knows about.
const NOTIFY_TYPES = [
  {
    type: 'signin',
    icon: Bell,
    title: 'Staff sign-in notes',
    description: 'Sent when a staff account signs in.',
    waiting: 'No staff sign-in has been recorded yet.',
    fix: 'Check SIGNIN_NOTIFY_EMAIL (or ADMIN_EMAIL) and that the Gmail app password is still valid, then sign in as a staff account.'
  },
  {
    type: 'failed',
    icon: ShieldAlert,
    title: 'Failed sign-in alerts',
    description: 'Sent after several wrong passwords in a row for one account.',
    waiting: 'No failed sign-in alert has been triggered yet.',
    fix: 'Uses the same mail settings as the sign-in note: check the app password, then enter wrong passwords for one account to test.'
  },
  {
    type: 'throttle',
    icon: Gauge,
    title: 'Sign-in throttle alerts',
    description: 'Sent when one IP address fails repeatedly across accounts.',
    waiting: 'No throttle alert has been triggered yet.',
    fix: 'Uses the same mail settings as the sign-in note: check the app password and the recipient address.'
  },
  {
    type: 'suspended',
    icon: UserX,
    title: 'Suspended account alerts',
    description: 'Sent when a suspended account tries its real password.',
    waiting: 'No suspended account has tried to sign in yet.',
    fix: 'Uses the same mail settings as the sign-in note: check the app password and the recipient address.'
  }
];

const StatusPill = ({ state }) => {
  if (state === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-400/15 text-emerald-300">
        <CheckCircle2 className="w-3 h-3" /> Ready
      </span>
    );
  }
  if (state === 'waiting') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/10 text-muted">
        Waiting
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
          {status.state === 'missing' && fix && (
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
  // The endpoint only reports this for an admin, and reports an empty map before any note has
  // been attempted: presence is what decides whether the rows show, not a truthy record
  const [notifyVisible, setNotifyVisible] = useState(false);
  const [notifyStatuses, setNotifyStatuses] = useState({});
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
      setNotifyVisible(data.notifyStatus !== undefined);
      setNotifyStatuses(data.notifyStatus ?? {});
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

  const notifyStatusFor = (type, waiting) => {
    const last = notifyStatuses ? notifyStatuses[type] : null;
    if (!last || !last.at) return { state: 'waiting', detail: waiting };

    const when = new Date(last.at).toLocaleString();
    if (last.sent) {
      return { state: 'ok', detail: `Last note sent ${when} to ${last.to || 'the admin address'}.` };
    }
    const reason = NOTIFY_REASONS[last.reason] || last.reason || 'the reason was not recorded';
    return {
      state: 'missing',
      detail: `Last note was not sent (${when}): ${reason}${last.error ? ` — ${last.error}` : ''}.`
    };
  };

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

          {notifyVisible &&
            NOTIFY_TYPES.map(({ type, icon, title, description, waiting, fix }) => (
              <Row
                key={type}
                icon={icon}
                title={title}
                description={description}
                status={notifyStatusFor(type, waiting)}
                fix={fix}
              />
            ))}
        </div>

        <div className="px-5 py-3 border-t border-white/10 text-[11px] text-muted">
          Checks run against the live endpoints each time this panel opens.
        </div>
      </div>
    </div>
  );
}
