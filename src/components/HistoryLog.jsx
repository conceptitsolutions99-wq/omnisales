import React, { useEffect, useState } from 'react';
import { History, Mail, MessageSquare, PhoneCall, Send, Trash2, UserCheck } from 'lucide-react';
import { isOwnActivity } from '../lib/activity-owner';
import { activityEventKey } from '../lib/activity-merge';

const EMAIL_LOG_KEY = 'cit_email_delivery_log';

// How the From of a recorded send was decided, so the log explains itself without the server logs
const SENDER_MODES = {
  account: {
    label: 'Gmail account',
    className: 'bg-slate-400/15 text-slate-300',
    hint: 'Sent as the signed-in Gmail account, so SPF and DKIM stay aligned'
  },
  alias: {
    label: 'Verified alias',
    className: 'bg-emerald-400/15 text-emerald-300',
    hint: 'Sent as a Gmail “send mail as” address that the account has verified'
  },
  relay: {
    label: 'Relay sender',
    className: 'bg-sky-400/15 text-sky-300',
    hint: 'MAIL_FROM sent through the configured relay host'
  }
};

// A test proves the path only if the receiver agrees: these are Gmail's own SPF, DKIM and DMARC
// verdicts for the delivered copy, read back over IMAP, shown next to the From that was used
const AUTH_MECHANISMS = ['spf', 'dkim', 'dmarc'];

const AuthenticationVerdicts = ({ result }) => {
  if (!result) return null;

  if (!result.found) {
    const message =
      result.reason === 'imap_not_configured'
        ? 'Add GMAIL_USER and GMAIL_APP_PASSWORD to read the verdicts back.'
        : result.reason === 'not_delivered_yet'
          ? 'Gmail had not delivered the copy into the inbox yet, so no verdicts were read. Send the test again in a moment.'
          : `Verdicts unavailable: ${result.reason || 'unknown reason'}`;
    return <div className="mt-2 text-[11px] text-amber-300/90">{message}</div>;
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
      {AUTH_MECHANISMS.map((mechanism) => {
        const verdict = String(result[mechanism] || '').toLowerCase();
        return (
          <span
            key={mechanism}
            className={`px-2 py-0.5 rounded-full uppercase tracking-wider ${
              !verdict
                ? 'bg-slate-400/15 text-slate-300'
                : verdict === 'pass'
                  ? 'bg-emerald-400/15 text-emerald-300'
                  : 'bg-rose-400/15 text-rose-300'
            }`}
          >
            {mechanism} {verdict || '—'}
          </span>
        );
      })}
      <span className="ml-1 font-medium text-muted">
        {result.aligned ? 'aligned with the From' : 'not aligned with the From'}
        {result.fromDomain ? ` · ${result.fromDomain}` : ''}
      </span>
    </div>
  );
};

const readLocalEmailLog = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(EMAIL_LOG_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
};

const writeLocalEmailLog = (entries) => {
  try {
    localStorage.setItem(EMAIL_LOG_KEY, JSON.stringify(entries.slice(0, 100)));
  } catch (err) {
    /* storage unavailable: the server copy is still the record */
  }
};

export default function HistoryLog({ callLogs, currentUser, onDeleteActivity }) {
  // Call and WhatsApp history filters
  const [callHistorySearch, setCallHistorySearch] = useState('');
  const [historyName, setHistoryName] = useState('');
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [historyCaller, setHistoryCaller] = useState('All');
  const [channelFilter, setChannelFilter] = useState('All');

  // Deleting history is an admin action and it applies to the whole team. Entries are selected by
  // their event key, which every recorded event has even when it predates ids.
  const [selectedLogKeys, setSelectedLogKeys] = useState([]);
  const [deletingHistory, setDeletingHistory] = useState(false);
  const [historyMessage, setHistoryMessage] = useState('');
  const [historyError, setHistoryError] = useState('');

  // Email delivery log
  const [emailLog, setEmailLog] = useState([]);
  const [emailSenderFilter, setEmailSenderFilter] = useState('All');
  const [senderFilter, setSenderFilter] = useState('All');
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [emailSender, setEmailSender] = useState('');
  const [emailFrom, setEmailFrom] = useState('');
  const [emailFromOverridden, setEmailFromOverridden] = useState(false);
  const [testEmailBusy, setTestEmailBusy] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState(null);

  // Deleting a delivery is an admin action too, and it covers the whole team: the log is the
  // shared record of what left the mailbox. Rows are selected by their id.
  const [selectedEmailIds, setSelectedEmailIds] = useState([]);
  const [deletingEmails, setDeletingEmails] = useState(false);
  const [emailLogMessage, setEmailLogMessage] = useState('');
  const [emailLogError, setEmailLogError] = useState('');

  const canSendTest = currentUser.role === 'Admin' || Boolean(currentUser.permissions?.admin);

  const fetchEmailLog = async () => {
    const local = readLocalEmailLog();
    try {
      const response = await fetch('/api/emails');
      if (!response.ok) throw new Error(`Log unavailable (${response.status})`);
      const data = await response.json();
      const serverEmails = Array.isArray(data.emails) ? data.emails : [];
      // An admin deleted some rows: this browser's own copy drops them instead of merging them
      // back, and the stored copy is rewritten so they do not return on the next visit
      const deleted = new Set((Array.isArray(data.deleted) ? data.deleted : []).map(String));
      const keptLocal = local.filter((entry) => !deleted.has(String(entry.id)));
      if (keptLocal.length !== local.length) writeLocalEmailLog(keptLocal);
      // The server's copy of a send records the From it left with; the browser copy keeps what
      // a warm serverless instance may have forgotten, so a duplicate keeps both sets of facts
      const byId = new Map();
      for (const entry of keptLocal) byId.set(entry.id, entry);
      for (const entry of serverEmails) {
        const existing = byId.get(entry.id);
        const filled = Object.fromEntries(
          Object.entries(entry).filter(([, value]) => value !== null && value !== undefined && value !== '')
        );
        byId.set(entry.id, existing ? { ...existing, ...filled } : entry);
      }
      setEmailLog([...byId.values()].sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt)));
      setEmailConfigured(data.configured !== false);
      setEmailSender(data.sender || '');
      setEmailFrom(data.from || '');
      setEmailFromOverridden(Boolean(data.fromOverridden));
    } catch (err) {
      setEmailLog(local);
    }
  };

  useEffect(() => {
    fetchEmailLog();
  }, []);

  const isAdminView = currentUser.role === 'Admin' || Boolean(currentUser.permissions?.admin);
  const filteredLogs = callLogs.filter((log) => {
    const isUserCaller = isOwnActivity(log, currentUser);
    const matchesPermission = isAdminView || isUserCaller;
    const query = callHistorySearch.toLowerCase();
    const matchesSearch =
      (log.leadName || '').toLowerCase().includes(query) ||
      (log.company || '').toLowerCase().includes(query) ||
      (log.caller || '').toLowerCase().includes(query) ||
      (log.outcome || '').toLowerCase().includes(query) ||
      (log.channel || 'Call').toLowerCase().includes(query) ||
      (log.notes || '').toLowerCase().includes(query);
    const nameQuery = historyName.trim().toLowerCase();
    const matchesName =
      !nameQuery || `${log.leadName || ''} ${log.company || ''}`.toLowerCase().includes(nameQuery);
    // Outreach entries carry a readable "YYYY-MM-DD HH:mm" timestamp and emails an ISO sentAt,
    // so the first ten characters are the day either way
    const logDay = String(log.timestamp || log.sentAt || '').slice(0, 10);
    const matchesDate = (!historyFrom || logDay >= historyFrom) && (!historyTo || logDay <= historyTo);
    const matchesCaller = historyCaller === 'All' || (log.caller || '') === historyCaller;
    const channel = log.channel || 'Call';
    const matchesChannel =
      channelFilter === 'All' ||
      (channelFilter === 'Emails'
        ? channel === 'Email'
        : channelFilter === 'WhatsApp'
          ? channel === 'WhatsApp'
          : channel !== 'Email' && channel !== 'WhatsApp');
    return matchesPermission && matchesSearch && matchesChannel && matchesName && matchesDate && matchesCaller;
  });

  const logKey = (log) => activityEventKey(log);
  // The selection survives a filter change, so the count and the delete always describe the same
  // entries, not just the ones currently visible
  const selectedLogs = callLogs.filter((log) => selectedLogKeys.includes(logKey(log)));
  const visibleLogKeys = filteredLogs.map(logKey);
  const allVisibleSelected =
    visibleLogKeys.length > 0 && visibleLogKeys.every((key) => selectedLogKeys.includes(key));

  const toggleLogSelection = (log) => {
    const key = logKey(log);
    setSelectedLogKeys((prev) => (prev.includes(key) ? prev.filter((value) => value !== key) : [...prev, key]));
  };

  const toggleSelectAllVisibleLogs = () => {
    setSelectedLogKeys((prev) =>
      allVisibleSelected
        ? prev.filter((key) => !visibleLogKeys.includes(key))
        : [...new Set([...prev, ...visibleLogKeys])]
    );
  };

  const handleDeleteSelectedHistory = async () => {
    if (!isAdminView || selectedLogs.length === 0 || deletingHistory || !onDeleteActivity) return;

    const count = selectedLogs.length;
    const label = count === 1 ? 'entry' : 'entries';
    if (
      !window.confirm(
        `Delete ${count} history ${label} for the whole team?\n\nThis removes calls, WhatsApp contacts and emails logged by anyone, and cannot be undone.`
      )
    )
      return;

    setDeletingHistory(true);
    setHistoryError('');
    setHistoryMessage('');
    try {
      await onDeleteActivity({
        keys: selectedLogs.map(logKey),
        ids: selectedLogs.map((log) => log.id).filter((id) => id !== undefined && id !== null)
      });
      setSelectedLogKeys([]);
      setHistoryMessage(`Deleted ${count} history ${label} for the whole team.`);
      setTimeout(() => setHistoryMessage(''), 8000);
    } catch (err) {
      setHistoryError(
        err.message === 'Failed to fetch'
          ? 'Cannot reach the server, so nothing was deleted.'
          : err.message
      );
    } finally {
      setDeletingHistory(false);
    }
  };

  // Only the employees this viewer can already see, so the list never offers a name that would
  // then return nothing
  const historyCallers = [
    ...new Set(
      callLogs
        .filter((log) => isAdminView || isOwnActivity(log, currentUser))
        .map((log) => String(log.caller || '').trim())
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b));

  // Older entries predate the Sender column, so they are counted as unknown rather than
  // disappearing from the audit
  const senderModeOf = (entry) => {
    const mode = String(entry?.fromMode || '');
    return Object.prototype.hasOwnProperty.call(SENDER_MODES, mode) ? mode : 'unknown';
  };

  // The log follows the same rule as the server: an admin sees every send, an agent only the
  // messages they sent. Ownership follows the address stored with the send, so a renamed
  // employee keeps their history; older rows without an address fall back to the display name.
  const viewerEmail = String(currentUser.email || '').trim().toLowerCase();
  const isOwnEmail = (entry) => {
    const owner = String(entry.sentByEmail || '').trim().toLowerCase();
    if (owner) return owner === viewerEmail;
    return String(entry.sentBy || '') === currentUser.name;
  };
  const emailLogForViewer = emailLog.filter((entry) => isAdminView || isOwnEmail(entry));
  // Use stable account addresses as filter keys, so a rename cannot split one person's history.
  // Legacy rows without an address fall back to their display name; label each option with the
  // latest display name seen for that key.
  const employeeKeyOf = (entry) => {
    const email = String(entry.sentByEmail || '').trim().toLowerCase();
    return email || String(entry.sentBy || '').trim();
  };
  const emailLogSenders = [
    ...new Map(
      emailLogForViewer
        .map((entry) => [employeeKeyOf(entry), String(entry.sentBy || '').trim() || employeeKeyOf(entry)])
        .filter(([key]) => Boolean(key))
        .sort((a, b) => a[1].localeCompare(b[1]))
    )
  ];
  // The path counts follow the employee picked, so the chips describe that person's sends
  const emailLogForEmployee =
    emailSenderFilter === 'All'
      ? emailLogForViewer
      : emailLogForViewer.filter((entry) => employeeKeyOf(entry) === emailSenderFilter);
  const senderCounts = emailLogForEmployee.reduce(
    (counts, entry) => {
      const mode = senderModeOf(entry);
      counts[mode] = (counts[mode] || 0) + 1;
      return counts;
    },
    { unknown: 0 }
  );
  const visibleEmailLog =
    senderFilter === 'All'
      ? emailLogForEmployee
      : emailLogForEmployee.filter((entry) => senderModeOf(entry) === senderFilter);

  // The selection survives a filter change, so the count and the delete describe the same rows
  const visibleEmailIds = visibleEmailLog.map((entry) => String(entry.id));
  const allVisibleEmailsSelected =
    visibleEmailIds.length > 0 && visibleEmailIds.every((id) => selectedEmailIds.includes(id));

  const toggleEmailSelection = (entry) => {
    const id = String(entry.id);
    setSelectedEmailIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const toggleSelectAllVisibleEmails = () => {
    setSelectedEmailIds((prev) =>
      allVisibleEmailsSelected
        ? prev.filter((id) => !visibleEmailIds.includes(id))
        : [...new Set([...prev, ...visibleEmailIds])]
    );
  };

  const handleDeleteSelectedEmails = async () => {
    if (!isAdminView || selectedEmailIds.length === 0 || deletingEmails) return;

    const count = selectedEmailIds.length;
    const label = count === 1 ? 'delivery' : 'deliveries';
    if (
      !window.confirm(
        `Delete ${count} ${label} from the delivery log for the whole team?\n\nThis removes the record of those sends for everyone, and cannot be undone.`
      )
    )
      return;

    setDeletingEmails(true);
    setEmailLogError('');
    setEmailLogMessage('');
    try {
      const response = await fetch('/api/emails', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedEmailIds })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `The delete failed (${response.status}).`);

      const deleted = new Set((Array.isArray(data.deleted) ? data.deleted : []).map(String));
      writeLocalEmailLog(readLocalEmailLog().filter((entry) => !deleted.has(String(entry.id))));
      setEmailLog((prev) => prev.filter((entry) => !deleted.has(String(entry.id))));
      setSelectedEmailIds([]);
      setEmailLogMessage(`Deleted ${count} ${label} from the delivery log for the whole team.`);
      setTimeout(() => setEmailLogMessage(''), 8000);
    } catch (err) {
      setEmailLogError(
        err.message === 'Failed to fetch'
          ? 'Cannot reach the server, so nothing was deleted.'
          : err.message
      );
    } finally {
      setDeletingEmails(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (testEmailBusy) return;

    setTestEmailBusy(true);
    setTestEmailResult(null);
    try {
      const response = await fetch('/api/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `The test email failed (${response.status}).`);

      setTestEmailResult({
        ok: true,
        to: data.email?.to || '',
        from: data.from || data.email?.from || '',
        mode: data.fromMode || data.email?.fromMode || '',
        messageId: data.messageId || data.email?.providerId || '',
        authentication: data.authentication || null
      });
      fetchEmailLog();
    } catch (err) {
      setTestEmailResult({
        ok: false,
        error: err.message === 'Failed to fetch' ? 'Cannot reach the mail service.' : err.message
      });
    } finally {
      setTestEmailBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center">
          <History className="w-7 h-7 mr-2 text-emerald-600" />
          Outreach History
        </h1>
        <p className="text-sm text-muted mt-1">
          Every call, WhatsApp contact and email recorded by the team, with the delivery path each message
          took.
        </p>
      </div>

      {/* Call History Section */}
      <div className="glass p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center">
            <History className="w-5 h-5 mr-2 text-emerald-600" />
            Outbound Call &amp; Email History ({filteredLogs.length})
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {isAdminView && (
              <button
                onClick={handleDeleteSelectedHistory}
                disabled={selectedLogs.length === 0 || deletingHistory}
                title="Delete the selected history entries for the whole team"
                className="px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-[11px] font-semibold rounded-xl inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deletingHistory ? 'Deleting…' : `Delete Selected (${selectedLogs.length})`}
              </button>
            )}
            <div className="flex items-center gap-1 p-1 rounded-xl glass-soft" role="group" aria-label="Filter history by channel">
              {['All', 'Calls', 'Emails', 'WhatsApp'].map((option) => {
                const isActive = channelFilter === option;
                return (
                  <button
                    key={option}
                    onClick={() => setChannelFilter(option)}
                    aria-pressed={isActive}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                      isActive
                        ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-600/25'
                        : 'text-muted hover:text-[var(--text-primary)] hover:bg-white/[0.06]'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="Filter by name..."
                value={historyName}
                onChange={(e) => setHistoryName(e.target.value)}
                aria-label="Filter history by contact or company name"
                className="py-2 px-3 pl-8 glass-input rounded-xl text-xs dark:text-white w-full sm:w-44"
              />
              <UserCheck className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted" />
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Filter history by date range">
              <input
                type="date"
                value={historyFrom}
                onChange={(e) => setHistoryFrom(e.target.value)}
                aria-label="History from this date"
                title="Show entries recorded on or after this day"
                className="py-2 px-2 glass-input rounded-xl text-xs dark:text-white"
              />
              <span className="text-[11px] text-muted">to</span>
              <input
                type="date"
                value={historyTo}
                onChange={(e) => setHistoryTo(e.target.value)}
                aria-label="History up to this date"
                title="Show entries recorded on or before this day"
                className="py-2 px-2 glass-input rounded-xl text-xs dark:text-white"
              />
            </div>
            <select
              value={historyCaller}
              onChange={(e) => setHistoryCaller(e.target.value)}
              aria-label="Filter history by the employee who made the entry"
              title="Show only the entries one employee recorded"
              className="py-2 px-3 glass-input rounded-xl text-xs dark:text-white"
            >
              <option value="All">Everyone</option>
              {historyCallers.map((caller) => (
                <option key={caller} value={caller}>
                  {caller}
                </option>
              ))}
            </select>
            <div className="relative">
              <input
                type="text"
                placeholder="Search calls, emails, outcomes..."
                value={callHistorySearch}
                onChange={(e) => setCallHistorySearch(e.target.value)}
                className="py-2 px-3 pl-8 glass-input rounded-xl text-xs dark:text-white w-full sm:w-56"
              />
              <History className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted" />
            </div>
            {(historyName || historyFrom || historyTo || historyCaller !== 'All') && (
              <button
                onClick={() => {
                  setHistoryName('');
                  setHistoryFrom('');
                  setHistoryTo('');
                  setHistoryCaller('All');
                }}
                title="Clear the name, date range and employee filters"
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-muted hover:text-[var(--text-primary)] hover:bg-white/[0.06]"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {historyMessage && (
          <div className="p-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 text-[11px] font-medium">
            {historyMessage}
          </div>
        )}
        {historyError && (
          <div className="p-3 rounded-xl border border-rose-400/30 bg-rose-400/10 text-rose-300 text-[11px] font-medium">
            {historyError}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="glass-head text-xs font-semibold uppercase tracking-wider text-muted">
                {isAdminView && (
                  <th className="py-3.5 px-3 w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisibleLogs}
                      aria-label="Select all history entries shown"
                      title="Select every entry the current filters show"
                      className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                    />
                  </th>
                )}
                <th className="py-3 px-4">Contact / Company</th>
                <th className="py-3 px-4">Channel</th>
                <th className="py-3 px-4">Caller</th>
                <th className="py-3 px-4">Outcome</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Call Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07] text-sm">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={isAdminView ? 8 : 7} className="text-center py-8 text-muted">
                    No calls or emails recorded yet.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={logKey(log)} className="row-hover">
                    {isAdminView && (
                      <td className="py-3.5 px-3 align-top">
                        <input
                          type="checkbox"
                          checked={selectedLogKeys.includes(logKey(log))}
                          onChange={() => toggleLogSelection(log)}
                          aria-label={`Select the ${log.channel || 'call'} entry for ${log.leadName || 'this lead'}`}
                          className="mt-1 h-4 w-4 rounded accent-blue-600 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-[var(--text-primary)]">{log.leadName}</div>
                      <div className="text-xs text-muted">{log.company}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
                          log.channel === 'Email'
                            ? 'bg-indigo-400/15 text-indigo-300'
                            : log.channel === 'WhatsApp'
                              ? 'bg-teal-400/15 text-teal-300'
                              : 'bg-emerald-400/15 text-emerald-300'
                        }`}
                      >
                        {log.channel === 'Email' ? (
                          <Mail className="w-3 h-3 mr-1" />
                        ) : log.channel === 'WhatsApp' ? (
                          <MessageSquare className="w-3 h-3 mr-1" />
                        ) : (
                          <PhoneCall className="w-3 h-3 mr-1" />
                        )}
                        {log.channel === 'Email' ? 'Email' : log.channel === 'WhatsApp' ? 'WhatsApp' : 'Call'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-[var(--text-primary)]/80">
                      {log.caller}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        log.outcome === 'Emailed' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' :
                        log.outcome === 'WhatsApped' ? 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300' :
                        log.outcome === 'Deal Completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' :
                        log.outcome === 'Considering' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' :
                        log.outcome === 'Call Back Later' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' :
                        'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                      }`}>
                        {log.outcome}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-[var(--text-primary)]/80">
                      {log.duration}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-muted">
                      {log.timestamp}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[var(--text-secondary)] max-w-xs truncate">
                      {log.notes}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Email Delivery Log */}
      <div className="glass p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center">
            <Mail className="w-5 h-5 mr-2 text-indigo-400" />
            Email Delivery Log ({emailLogForViewer.length})
          </h3>
          <div className="text-[11px] text-muted sm:text-right space-y-1">
            {isAdminView && (
              <button
                onClick={handleDeleteSelectedEmails}
                disabled={selectedEmailIds.length === 0 || deletingEmails}
                title="Delete the selected deliveries from the log for the whole team"
                className="mr-2 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-[11px] font-semibold inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deletingEmails ? 'Deleting…' : `Delete Selected (${selectedEmailIds.length})`}
              </button>
            )}
            {canSendTest && (
              <button
                onClick={handleSendTestEmail}
                disabled={testEmailBusy || !emailConfigured}
                title="Send one real test through the configured mail path, addressed only to your own account"
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[11px] font-semibold inline-flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                {testEmailBusy ? 'Sending test…' : 'Send test to myself'}
              </button>
            )}
            <div>
              {emailConfigured
                ? `Sending as ${emailFrom || emailSender || 'your Gmail account'} · newest first`
                : 'Sending not configured — add GMAIL_USER and GMAIL_APP_PASSWORD to the environment variables'}
            </div>
            {emailConfigured && emailFromOverridden && (
              <p className="text-amber-500 mt-0.5 max-w-xs">
                MAIL_FROM was ignored: Gmail only sends as the signed-in account. Set
                GMAIL_FROM_ALIAS_VERIFIED=true once that address is a verified “send mail as” alias.
              </p>
            )}
          </div>
        </div>

        {testEmailResult && (
          <div
            className={`p-3 rounded-xl border text-[11px] font-medium ${
              testEmailResult.ok
                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                : 'border-rose-400/30 bg-rose-400/10 text-rose-300'
            }`}
          >
            {testEmailResult.ok ? (
              <>
                <span>
                  Test email sent to <strong>{testEmailResult.to}</strong>
                  {testEmailResult.from && (
                    <>
                      {' · From '}
                      <strong className="font-mono">{testEmailResult.from}</strong>
                    </>
                  )}
                  {testEmailResult.mode && <> · {SENDER_MODES[testEmailResult.mode]?.label || testEmailResult.mode}</>}
                  {testEmailResult.messageId && (
                    <>
                      {' · id '}
                      <span className="font-mono">{testEmailResult.messageId}</span>
                    </>
                  )}
                </span>
                <AuthenticationVerdicts result={testEmailResult.authentication} />
              </>
            ) : (
              <span>{testEmailResult.error}</span>
            )}
          </div>
        )}

        {emailLogMessage && (
          <div className="p-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 text-[11px] font-medium">
            {emailLogMessage}
          </div>
        )}
        {emailLogError && (
          <div className="p-3 rounded-xl border border-rose-400/30 bg-rose-400/10 text-rose-300 text-[11px] font-medium">
            {emailLogError}
          </div>
        )}

        {/* Which From each send used and which employee made it, so a month of sends can be
            audited per path and per person */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={emailSenderFilter}
            onChange={(e) => setEmailSenderFilter(e.target.value)}
            aria-label="Filter the delivery log by the employee who sent the email"
            title="Show only the sends one employee made"
            className="py-1.5 px-3 glass-input rounded-lg text-[11px] font-semibold dark:text-white"
          >
            <option value="All">Everyone</option>
            {emailLogSenders.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {[{ key: 'All', label: 'All sends' }, ...Object.entries(SENDER_MODES).map(([key, mode]) => ({ key, label: mode.label }))]
            .concat(senderCounts.unknown > 0 ? [{ key: 'unknown', label: 'Sender not recorded' }] : [])
            .map((chip) => {
              const count = chip.key === 'All' ? emailLogForEmployee.length : senderCounts[chip.key] || 0;
              const isActive = senderFilter === chip.key;
              return (
                <button
                  key={chip.key}
                  onClick={() => setSenderFilter(chip.key)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all inline-flex items-center gap-1.5 ${
                    isActive
                      ? 'accent-pill text-[var(--accent)]'
                      : 'glass-soft text-muted hover:text-[var(--text-primary)]'
                  }`}
                  title={
                    chip.key === 'All'
                      ? 'Every delivery in the log'
                      : SENDER_MODES[chip.key]?.hint || 'Sends made before the Sender column existed'
                  }
                >
                  <span>{chip.label}</span>
                  <span
                    className={`px-1.5 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-[var(--accent)]/20' : 'bg-white/10'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          {(senderFilter !== 'All' || emailSenderFilter !== 'All') && (
            <button
              onClick={() => {
                setSenderFilter('All');
                setEmailSenderFilter('All');
              }}
              title="Clear the sender path and employee filters"
              className="px-2.5 py-1.5 rounded-lg glass-soft text-[11px] font-semibold text-muted hover:text-[var(--text-primary)]"
            >
              Clear
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="glass-head text-xs font-semibold uppercase tracking-wider text-muted">
                {isAdminView && (
                  <th className="py-3 px-3 w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleEmailsSelected}
                      onChange={toggleSelectAllVisibleEmails}
                      aria-label="Select all deliveries shown"
                      title="Select every delivery the current filters show"
                      className="h-4 w-4 rounded accent-blue-600 cursor-pointer"
                    />
                  </th>
                )}
                <th className="py-3 px-4">Recipient</th>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Sender</th>
                <th className="py-3 px-4">Sent By</th>
                <th className="py-3 px-4">Sent At</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07] text-sm">
              {visibleEmailLog.length === 0 ? (
                <tr>
                  <td colSpan={isAdminView ? 7 : 6} className="text-center py-8 text-muted">
                    {emailLogForViewer.length === 0
                      ? emailLog.length === 0
                        ? 'No emails sent yet. Compose one in the Dialler.'
                        : 'You have not sent any emails yet. This log shows only your own sends.'
                      : emailSenderFilter !== 'All'
                        ? `No sends by ${emailLogSenders.find(([key]) => key === emailSenderFilter)?.[1] || emailSenderFilter} match these filters. Choose another employee or clear it.`
                        : 'No sends used that sender. Choose another filter or clear it.'}
                  </td>
                </tr>
              ) : (
                visibleEmailLog.map((entry) => (
                  <tr key={entry.id} className="row-hover">
                    {isAdminView && (
                      <td className="py-3.5 px-3 align-top">
                        <input
                          type="checkbox"
                          checked={selectedEmailIds.includes(String(entry.id))}
                          onChange={() => toggleEmailSelection(entry)}
                          aria-label={`Select the delivery to ${entry.to || 'this recipient'}`}
                          className="mt-1 h-4 w-4 rounded accent-blue-600 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-[var(--text-primary)]">{entry.leadName || entry.to}</div>
                      <div className="text-xs text-muted font-mono">{entry.to}</div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[var(--text-secondary)] max-w-xs truncate" title={entry.subject}>
                      {entry.subject}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      {entry.from ? (
                        <>
                          <div
                            className="font-mono text-[var(--text-primary)]/80 truncate max-w-[200px]"
                            title={`${entry.from}${entry.fromMode ? ` — ${SENDER_MODES[entry.fromMode]?.hint || entry.fromMode}` : ''}`}
                          >
                            {entry.from}
                          </div>
                          {entry.fromMode && (
                            <span
                              className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                SENDER_MODES[entry.fromMode]?.className || 'bg-slate-400/15 text-slate-300'
                              }`}
                              title={SENDER_MODES[entry.fromMode]?.hint || entry.fromMode}
                            >
                              {SENDER_MODES[entry.fromMode]?.label || entry.fromMode}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted" title="This send was recorded before the From address was logged">
                          —
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-[var(--text-primary)]/80">{entry.sentBy}</td>
                    <td className="py-3.5 px-4 text-xs text-muted font-mono">
                      {new Date(entry.sentAt).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          entry.status === 'sent'
                            ? 'bg-emerald-400/15 text-emerald-300'
                            : entry.status === 'failed'
                            ? 'bg-rose-400/15 text-rose-300'
                            : 'bg-amber-400/15 text-amber-300'
                        }`}
                        title={entry.error || entry.providerId || ''}
                      >
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
