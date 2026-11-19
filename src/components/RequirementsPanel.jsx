import React, { useState } from 'react';
import { X, RefreshCw, ClipboardList, ChevronDown, Link2, CheckCircle2, Clock, AlertTriangle, Trash2 } from 'lucide-react';
import { REQUIREMENT_FORMS, REQUIREMENT_DETAILS } from '../data/requirementForms';
import { requirementLink, deleteRequirementForms } from '../lib/requirements';
import { buildQuote, quoteSubject, quoteCurrency } from '../lib/quote';
import { buildSignature } from '../lib/signature';
import { markLeadContacted } from '../lib/lead-status';

const when = (value) => {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
};

function Answers({ request }) {
  const form = REQUIREMENT_FORMS[request.type];
  if (!form) return null;

  const details = request.details || {};
  const answers = request.answers || {};

  return (
    <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
      <div className="grid sm:grid-cols-2 gap-2">
        {REQUIREMENT_DETAILS.map((field) => {
          const value = details[field.id];
          if (!value) return null;
          return (
            <div key={field.id}>
              <div className="text-[10px] uppercase tracking-wider text-muted">{field.label}</div>
              <div className="text-[12px] text-[var(--text-primary)] whitespace-pre-wrap">{value}</div>
            </div>
          );
        })}
      </div>

      {form.sections.map((section) => {
        const picked = answers[section.id] || [];
        if (!picked.length) return null;
        return (
          <div key={section.id}>
            <div className="text-[10px] uppercase tracking-wider text-muted">{section.title}</div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {picked.map((option) => (
                <span key={option} className="px-2 py-0.5 rounded-md text-[11px] bg-indigo-500/15 border border-indigo-400/30 text-indigo-200">
                  {option}
                </span>
              ))}
            </div>
          </div>
        );
      })}

      {request.notes && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">Anything else</div>
          <p className="text-[12px] text-[var(--text-secondary)] whitespace-pre-wrap">{request.notes}</p>
        </div>
      )}
    </div>
  );
}

// The ticked scope becomes a priced quote the agent can copy or email straight back
function QuoteBuilder({ request, currentUser, setLeads }) {
  const [prices, setPrices] = useState({});
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const quote = buildQuote(request, prices, currentUser?.name || '');

  if (!quote.lines.length) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(quote.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setStatus('Clipboard unavailable — copy the lines from the form instead.');
    }
  };

  const email = async () => {
    if (!request.leadEmail) {
      setStatus('This form has no customer email.');
      return;
    }
    setSending(true);
    setStatus('');
    try {
      const response = await fetch('/api/emails', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: request.leadEmail,
          subject: quoteSubject(request),
          // A quote closes with the same signature block as an outreach note; the disclosure
          // and opt-out stay server-side, so this adds one sign-off and not a second one
          body: `${quote.text}\n\n${buildSignature(currentUser)}`,
          leadId: request.leadId ?? null,
          leadName: request.leadName,
          company: request.company
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Sending failed (${response.status}).`);
      markLeadContacted(setLeads, { leadId: request.leadId, email: request.leadEmail, by: currentUser?.name });
      setStatus(`Quote sent to ${request.leadEmail}.`);
    } catch (err) {
      setStatus(err.message === 'Failed to fetch' ? 'Cannot reach the mail service.' : err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Quote</span>
        <span className="text-[13px] font-bold text-[var(--text-primary)]">
          {quote.total ? `${quote.total.toLocaleString()} ${quoteCurrency}` : 'Price each line'}
        </span>
      </div>

      {quote.lines.map((line) => (
        <div key={line.id} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-[var(--text-primary)] truncate">{line.title}</div>
            <div className="text-[11px] text-muted truncate">{line.options.join(', ')}</div>
          </div>
          <input
            type="number"
            min="0"
            step="50"
            value={prices[line.id] ?? ''}
            onChange={(event) => setPrices({ ...prices, [line.id]: event.target.value })}
            placeholder="0"
            className="w-24 p-1.5 glass-input rounded-lg text-[12px] text-right dark:text-white"
            aria-label={`${line.title} price`}
          />
        </div>
      ))}

      <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
        <div className="flex gap-2">
          <button
            onClick={copy}
            className="px-2.5 py-1.5 rounded-lg glass-soft text-[11px] font-semibold text-muted hover:text-[var(--text-primary)]"
          >
            {copied ? 'Copied' : 'Copy quote'}
          </button>
          <button
            onClick={email}
            disabled={sending}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60"
          >
            {sending ? 'Sending…' : 'Email quote'}
          </button>
        </div>
        <span className="text-[11px] text-muted truncate max-w-[45%]">{request.leadEmail || 'no email on form'}</span>
      </div>

      {status && <p className="text-[11px] text-emerald-300">{status}</p>}
    </div>
  );
}

export default function RequirementsPanel({ open, onClose, requests, loading, error, isAdmin, canReview = false, currentUser, onRefresh, setLeads }) {
  const [expanded, setExpanded] = useState('');
  const [copied, setCopied] = useState('');
  // Admin-only selection, so several forms can be cleared out in one go
  const [selected, setSelected] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  if (!open) return null;

  const allSelected = requests.length > 0 && requests.every((request) => selected.has(request.token));

  const toggleSelected = (token) => {
    setDeleteError('');
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  };

  // Deleting a form also kills the customer's link, so it asks first and says so
  const deleteSelected = async () => {
    if (!selected.size || deleting) return;
    const count = selected.size;
    if (
      !window.confirm(
        `Delete ${count} requirement form${count === 1 ? '' : 's'}?\n\nThe customer's link stops working and the answers are removed. This cannot be undone.`
      )
    )
      return;

    setDeleting(true);
    setDeleteError('');
    try {
      await deleteRequirementForms([...selected]);
      setSelected(new Set());
      setExpanded('');
      await onRefresh?.();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const copy = async (token) => {
    try {
      await navigator.clipboard.writeText(requirementLink(token));
      setCopied(token);
      setTimeout(() => setCopied(''), 2000);
    } catch (err) {
      /* clipboard unavailable: the link is visible in the row anyway */
    }
  };

  const pending = requests.filter((request) => !request.submittedAt).length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-xl p-4 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-3xl glass-strong my-6">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-600/30">
              <ClipboardList className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-[var(--text-primary)] leading-tight">
                Requirements forms
                {pending > 0 && (
                  <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 align-middle">
                    {pending} awaiting
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-muted">
                {canReview ? 'Every form the team sent and what came back' : 'Forms you sent and what came back'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={loading}
              className="w-9 h-9 rounded-xl glass-soft flex items-center justify-center text-muted hover:text-[var(--text-primary)] disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl glass-soft flex items-center justify-center text-muted hover:text-rose-400"
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
          {loading && requests.length === 0 && <p className="text-center py-10 text-sm text-muted">Loading…</p>}

          {!loading && requests.length === 0 && !error && (
            <p className="text-center py-10 text-sm text-muted">
              No forms sent yet. Pick a requirements form when you write an email and the customer gets a link
              to fill it in.
            </p>
          )}

          {isAdmin && requests.length > 0 && (
            <div className="flex items-center justify-between gap-2 px-1 pb-1">
              <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-muted">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(requests.map((item) => item.token)) : new Set())
                  }
                  className="w-3.5 h-3.5 accent-rose-500"
                />
                Select all
              </label>
              <button
                onClick={deleteSelected}
                disabled={deleting || selected.size === 0}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-40 inline-flex items-center gap-1.5"
                title="Delete the chosen forms; their links stop working"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deleting ? 'Deleting…' : `Delete selected${selected.size ? ` (${selected.size})` : ''}`}
              </button>
            </div>
          )}

          {deleteError && <p className="px-1 pb-1 text-[11px] text-rose-400">{deleteError}</p>}

          {requests.map((request) => {
            const form = REQUIREMENT_FORMS[request.type];
            const open = expanded === request.token;
            return (
              <div
                key={request.token}
                className={`rounded-xl border glass-soft p-3.5 ${
                  selected.has(request.token) ? 'border-rose-400/40 bg-rose-500/5' : 'border-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {isAdmin && (
                    <input
                      type="checkbox"
                      checked={selected.has(request.token)}
                      onChange={() => toggleSelected(request.token)}
                      className="mt-1 w-3.5 h-3.5 accent-rose-500 shrink-0"
                      aria-label={`Select the form for ${request.leadName || request.leadEmail || 'customer'}`}
                    />
                  )}
                  <button
                    onClick={() => setExpanded(open ? '' : request.token)}
                    className="min-w-0 text-left flex-1"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[13px] text-[var(--text-primary)] truncate">
                        {request.leadName || request.leadEmail || 'Customer'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold accent-pill">
                        {form ? form.label : request.type}
                      </span>
                      {request.submittedAt ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300">
                          <CheckCircle2 className="w-3 h-3" /> submitted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300">
                          <Clock className="w-3 h-3" /> awaiting
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted truncate">
                      {request.company || request.leadEmail} · sent by {request.agent || 'unknown'} ·{' '}
                      {request.submittedAt ? `answered ${when(request.submittedAt)}` : `sent ${when(request.createdAt)}`}
                    </p>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => copy(request.token)}
                      className="w-8 h-8 rounded-lg glass-soft flex items-center justify-center text-muted hover:text-[var(--text-primary)]"
                      title="Copy the form link"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setExpanded(open ? '' : request.token)}
                      className="w-8 h-8 rounded-lg glass-soft flex items-center justify-center text-muted hover:text-[var(--text-primary)]"
                      title={open ? 'Hide' : 'Show answers'}
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>

                {copied === request.token && (
                  <p className="mt-2 text-[11px] text-emerald-300 break-all">{requirementLink(request.token)}</p>
                )}

                {open && (request.submittedAt ? (
                  <>
                    <Answers request={request} />
                    <QuoteBuilder request={request} currentUser={currentUser} setLeads={setLeads} />
                  </>
                ) : (
                  <p className="mt-3 border-t border-white/10 pt-3 text-[11px] text-muted">
                    Nothing yet. The link is {requirementLink(request.token)}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
