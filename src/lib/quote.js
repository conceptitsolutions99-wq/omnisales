// A quote is the ticked scope with an amount per section. Prices start empty on purpose:
// the app has no price list, so the agent prices what the customer actually asked for.
import { REQUIREMENT_FORMS } from '../data/requirementForms';

const money = (value) => {
  const number = Number(value) || 0;
  return number.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

// The printed forms ask for a budget in EGP, so quotes are priced in the same currency
export const quoteCurrency = 'EGP';

export function buildQuote(request, prices = {}, preparedBy = '') {
  const form = REQUIREMENT_FORMS[request?.type];
  if (!form) return { lines: [], total: 0, text: '', currency: quoteCurrency };

  const answers = request.answers || {};
  const details = request.details || {};

  const lines = form.sections
    .map((section) => ({
      id: section.id,
      title: section.title,
      options: answers[section.id] || []
    }))
    .filter((line) => line.options.length > 0);

  const priced = lines.map((line) => ({ ...line, amount: Number(prices[line.id]) || 0 }));
  const total = priced.reduce((sum, line) => sum + line.amount, 0);

  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const customer = [details.fullName || request.leadName, details.company || request.company].filter(Boolean).join(' · ');

  const text = [
    `QUOTE — ${form.title.replace(' Requirements', '')} project`,
    `Prepared for ${customer || 'your team'} on ${today}`,
    preparedBy ? `Prepared by ${preparedBy}` : '',
    '',
    'Scope',
    ...priced.map((line) => `• ${line.title}: ${line.options.join(', ')}`),
    '',
    details.budget ? `Budget you mentioned: ${details.budget}` : '',
    details.deadline ? `Needed by: ${details.deadline}` : '',
    '',
    'Investment',
    ...priced.map((line) => `${line.title} — ${money(line.amount)} ${quoteCurrency}`),
    `TOTAL — ${money(total)} ${quoteCurrency}`,
    '',
    'This quote covers the ticked items only. Anything left unticked can be added later.',
    '',
    'Questions? Just reply to this email.'
  ]
    .filter((line) => line !== '')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  return { lines: priced, total, text, currency: quoteCurrency };
}

export const quoteSubject = (request) => {
  const form = REQUIREMENT_FORMS[request?.type];
  return `Your quote — ${form ? form.label : 'project'} requirements`;
};
