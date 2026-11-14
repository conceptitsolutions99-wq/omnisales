import React, { useState } from 'react';
import { Check, Send, AlertTriangle } from 'lucide-react';
import { REQUIREMENT_DETAILS } from '../data/requirementForms';

const emptyDetails = () => REQUIREMENT_DETAILS.reduce((acc, field) => ({ ...acc, [field.id]: '' }), {});

export default function RequirementFormView({ form, leadName, company, submitting, error, onSubmit }) {
  const [details, setDetails] = useState(emptyDetails);
  const [answers, setAnswers] = useState({});
  const [other, setOther] = useState({});
  const [notes, setNotes] = useState('');
  const [localError, setLocalError] = useState('');

  const toggle = (sectionId, option) =>
    setAnswers((current) => {
      const picked = current[sectionId] || [];
      return {
        ...current,
        [sectionId]: picked.includes(option) ? picked.filter((item) => item !== option) : [...picked, option]
      };
    });

  const submit = (event) => {
    event.preventDefault();
    setLocalError('');

    const missing = REQUIREMENT_DETAILS.filter((field) => field.required && !String(details[field.id] || '').trim());
    if (missing.length) {
      setLocalError(`${missing[0].label} is required.`);
      return;
    }

    // "Other" notes travel as one extra answer per section, so nothing the customer typed is lost
    const merged = { ...answers };
    Object.entries(other).forEach(([sectionId, text]) => {
      if (String(text || '').trim()) merged[sectionId] = [...(merged[sectionId] || []), `Other: ${text.trim()}`];
    });

    onSubmit({ details, answers: merged, notes });
  };

  const chosen = Object.values(answers).reduce((total, picked) => total + picked.length, 0);

  return (
    <form onSubmit={submit} className="space-y-5">
      {(leadName || company) && (
        <p className="text-[12px] text-muted">
          Prepared for <span className="font-semibold text-[var(--text-primary)]">{leadName || company}</span>
          {leadName && company ? ` · ${company}` : ''}
        </p>
      )}

      <section className="glass-soft rounded-xl p-4 sm:p-5 space-y-3">
        <h3 className="text-[13px] font-bold text-[var(--text-primary)]">Your details</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {REQUIREMENT_DETAILS.map((field) => (
            <label
              key={field.id}
              className={`block ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}
            >
              <span className="block text-[11px] font-semibold text-muted mb-1">
                {field.label}
                {field.required && <span className="text-rose-400"> *</span>}
              </span>
              {field.type === 'textarea' ? (
                <textarea
                  value={details[field.id]}
                  onChange={(event) => setDetails({ ...details, [field.id]: event.target.value })}
                  placeholder={field.placeholder}
                  rows={3}
                  className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white resize-y"
                />
              ) : (
                <input
                  type={field.type}
                  value={details[field.id]}
                  onChange={(event) => setDetails({ ...details, [field.id]: event.target.value })}
                  placeholder={field.placeholder}
                  className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white"
                />
              )}
            </label>
          ))}
        </div>
      </section>

      {form.sections.map((section) => (
        <section key={section.id} className="glass-soft rounded-xl p-4 sm:p-5 space-y-3">
          <h3 className="text-[13px] font-bold text-[var(--text-primary)]">{section.title}</h3>
          <div className="flex flex-wrap gap-2">
            {section.options.map((option) => {
              const active = (answers[section.id] || []).includes(option);
              return (
                <button
                  type="button"
                  key={option}
                  onClick={() => toggle(section.id, option)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
                    active
                      ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-200'
                      : 'border-white/10 glass-soft text-[var(--text-secondary)] hover:border-white/25'
                  }`}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center ${
                      active ? 'border-indigo-300 bg-indigo-400 text-slate-900' : 'border-white/30'
                    }`}
                  >
                    {active && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                  </span>
                  {option}
                </button>
              );
            })}
          </div>
          <input
            value={other[section.id] || ''}
            onChange={(event) => setOther({ ...other, [section.id]: event.target.value })}
            placeholder="Other (tell us what else you need)"
            className="w-full p-2 glass-input rounded-lg text-[12px] dark:text-white"
          />
        </section>
      ))}

      <section className="glass-soft rounded-xl p-4 sm:p-5 space-y-2">
        <label className="block text-[11px] font-semibold text-muted">
          Anything else? Websites / apps you like, special requests, questions…
        </label>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          className="w-full p-2.5 glass-input rounded-xl text-sm dark:text-white resize-y"
        />
      </section>

      {(localError || error) && (
        <p className="flex items-start gap-2 text-[12px] font-medium text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          {localError || error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-muted">
          {chosen} {chosen === 1 ? 'option' : 'options'} ticked · unticked items are not part of the order
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-600/30 disabled:opacity-60"
        >
          <Send className="w-4 h-4" />
          {submitting ? 'Sending…' : 'Send requirements'}
        </button>
      </div>
    </form>
  );
}
