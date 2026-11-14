import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, AlertTriangle, ClipboardList } from 'lucide-react';
import { REQUIREMENT_FORMS } from '../data/requirementForms';
import { loadRequirementForm, submitRequirementForm } from '../lib/requirements';
import RequirementFormView from './RequirementFormView';

// No sign-in here: the token in the link is the only credential, and the page never shows
// anything except the form it was issued for.
export default function PublicRequirementPage({ token }) {
  const [state, setState] = useState({ loading: true, error: '', request: null });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    loadRequirementForm(token)
      .then((data) => alive && setState({ loading: false, error: '', request: data.request }))
      .catch((err) => alive && setState({ loading: false, error: err.message, request: null }));
    return () => {
      alive = false;
    };
  }, [token]);

  const submit = async (payload) => {
    setSubmitting(true);
    setSubmitError('');
    try {
      await submitRequirementForm(token, payload);
      setDone(true);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const form = state.request ? REQUIREMENT_FORMS[state.request.type] : null;

  return (
    <div className="min-h-screen px-3 sm:px-6 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="glass glass-strong rounded-2xl p-5 sm:p-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted">Concept IT Solutions</p>
              <h1 className="text-lg font-bold text-[var(--text-primary)] leading-tight">
                {form ? form.title : 'Project requirements'}
              </h1>
            </div>
          </div>
          <p className="text-[12px] text-muted mb-5">
            Tick the boxes for what you want. Unticked items are not part of the order — and you can send the
            form again if you change your mind.
          </p>

          {state.loading && (
            <p className="flex items-center gap-2 text-sm text-muted py-8">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading your form…
            </p>
          )}

          {state.error && (
            <p className="flex items-start gap-2 text-sm text-rose-300 py-6">
              <AlertTriangle className="w-4 h-4 mt-px shrink-0" /> {state.error}
            </p>
          )}

          {done && (
            <div className="py-8 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h2 className="text-base font-bold text-[var(--text-primary)]">Thank you — your answers are in</h2>
              <p className="text-sm text-muted">
                We have everything we need to prepare your quote and will reply by email shortly.
              </p>
            </div>
          )}

          {!done && form && (
            <RequirementFormView
              form={form}
              leadName={state.request.leadName}
              company={state.request.company}
              submitting={submitting}
              error={submitError}
              onSubmit={submit}
            />
          )}

          {!done && state.request && !form && (
            <p className="text-sm text-muted py-6">This link points at a form that is no longer offered.</p>
          )}
        </div>

        <p className="text-center text-[11px] text-muted mt-4">
          Sent by {state.request?.agent || 'Concept IT Solutions'} · questions? Just reply to the email.
        </p>
      </div>
    </div>
  );
}
