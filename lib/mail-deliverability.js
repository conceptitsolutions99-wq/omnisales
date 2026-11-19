// Deliverability helpers shared by the deployed function and the local server.
//
// Mailbox providers judge a first-contact message mostly on signals the sender controls:
// whether the From address belongs to the mailbox that authenticated, whether there is a reply
// path and a way to opt out, and whether the message is shaped like a person writing rather
// than a bulk blast. These helpers keep those signals in one place so both send paths agree.

const COMPANY_NAME = (process.env.COMPANY_NAME || 'Concept IT Solutions').trim();
const COMPANY_ADDRESS = (process.env.COMPANY_ADDRESS || '').trim();

const addressOf = (value) => {
  const text = String(value || '').trim();
  const angle = text.match(/<([^>]+)>/);
  return (angle ? angle[1] : text).trim();
};

const displayNameOf = (value) => {
  const text = String(value || '').trim();
  const angle = text.match(/^(.*?)<[^>]+>$/);
  return angle ? angle[1].replace(/["']/g, '').trim() : '';
};

const isGmailHost = (host) => /(^|\.)gmail\.com$/i.test(String(host || '').trim());

// Gmail rewrites any From that is not the authenticated account, which breaks SPF/DKIM
// alignment and makes the message look forged to the receiving filter. On Gmail the account
// address is therefore the only usable From. On a relay (SMTP_HOST pointed at a provider whose
// sending domain is verified) MAIL_FROM is the aligned address and its display name is kept.
const resolveSender = ({ smtpHost, smtpUser, mailFrom }) => {
  const configured = addressOf(mailFrom);
  const fallback = addressOf(smtpUser);
  const address = isGmailHost(smtpHost) ? fallback || configured : configured || fallback;
  const name = displayNameOf(mailFrom) || COMPANY_NAME;
  return { name, address, from: address ? `${name} <${address}>` : String(mailFrom || '') };
};

// A reply path that reaches a person is a positive signal, and it keeps answers out of the
// unattended mailbox. An agent address is used when it is a real one.
const replyTo = (agentEmail, senderAddress) => {
  const agent = addressOf(agentEmail);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(agent) && agent.toLowerCase() !== String(senderAddress || '').toLowerCase()) {
    return agent;
  }
  return '';
};

// Repeated punctuation, ALL-CAPS words and very long subjects are patterns bulk filters score
// against, and no outreach subject needs them.
const cleanSubject = (value) => {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/!{2,}/g, '!')
    .replace(/!\s*$/, '')
    .trim();
  return text.slice(0, 120) || `${COMPANY_NAME} introduction`;
};

const OPT_OUT_LINE = 'Reply "unsubscribe" and we will not write to you again.';

// A plain-text identity and opt-out line is what commercial-mail rules expect and what
// filters look for when they decide whether an unknown sender is legitimate.
const withFooter = (body) => {
  const text = String(body || '').trim();
  if (text.includes(OPT_OUT_LINE)) return text;
  const identity = COMPANY_ADDRESS ? `${COMPANY_NAME} · ${COMPANY_ADDRESS}` : COMPANY_NAME;
  return `${text}\n\n---\n${identity}\nYou are receiving this one-off business note because your business is publicly listed. ${OPT_OUT_LINE}\n`;
};

// A mailto unsubscribe is enough for a one-to-one note; one-click needs a hosted https endpoint,
// so that header is only added when UNSUBSCRIBE_URL points at one.
const unsubscribeHeaders = (mailbox) => {
  const target = addressOf(mailbox);
  const headers = {};
  if (target) headers['List-Unsubscribe'] = `<mailto:${target}?subject=unsubscribe>`;

  const url = String(process.env.UNSUBSCRIBE_URL || '').trim();
  if (/^https:\/\//i.test(url)) {
    headers['List-Unsubscribe'] = headers['List-Unsubscribe'] ? `<${url}>, ${headers['List-Unsubscribe']}` : `<${url}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  return headers;
};

module.exports = {
  COMPANY_NAME,
  COMPANY_ADDRESS,
  addressOf,
  resolveSender,
  replyTo,
  cleanSubject,
  withFooter,
  unsubscribeHeaders,
  OPT_OUT_LINE
};
