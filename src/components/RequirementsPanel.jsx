import React, { useState } from 'react';
import { X, RefreshCw, ClipboardList, ChevronDown, Link2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { REQUIREMENT_FORMS, REQUIREMENT_DETAILS } from '../data/requirementForms';
import { requirementLink } from '../lib/requirements';

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

export default function RequirementsPanel({ open, onClose, requests, loading, error, isAdmin, onRefresh }) {
  const [expanded, setExpanded] = useState('');
  const [copied, setCopied] = useState('');

  if (!open) return null;

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
                {isAdmin ? 'Every form the team sent and what came back' : 'Forms you sent and what came back'}
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

          {requests.map((request) => {
            const form = REQUIREMENT_FORMS[request.type];
            const open = expanded === request.token;
            return (
              <div key={request.token} className="rounded-xl border border-white/10 glass-soft p-3.5">
                <div className="flex items-start justify-between gap-3">
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

                {open && (request.submittedAt ? <Answers request={request} /> : (
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
