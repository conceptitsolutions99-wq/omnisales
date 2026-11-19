// Deliverability helpers shared by the deployed function and the local server.
//
// Mailbox providers judge a first-contact message mostly on signals the sender controls:
// whether the From address belongs to the mailbox that authenticated, whether there is a reply
// path and a way to opt out, and whether the message is shaped like a person writing rather
// than a bulk blast. These helpers keep those signals in one place so both send paths agree.

const COMPANY_NAME = (process.env.COMPANY_NAME || 'Concept IT Solutions').trim();

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

const aliasIsVerified = (value) => /^(1|true|yes)$/i.test(String(value ?? '').trim());

// Gmail rewrites any From that is not the authenticated account, which breaks SPF/DKIM
// alignment and makes the message look forged to the receiving filter. That is why the account
// address is the default. A Gmail "send mail as" alias that has already been verified is a
// legitimate exception, so it is used only when the deployment says so explicitly. On a relay
// (SMTP_HOST pointed at a provider whose sending domain is verified) MAIL_FROM is always used.
const resolveSender = ({ smtpHost, smtpUser, mailFrom, aliasVerified = false }) => {
  const configured = addressOf(mailFrom);
  const fallback = addressOf(smtpUser);
  const gmail = isGmailHost(smtpHost);
  const aliasAllowed = aliasIsVerified(aliasVerified);

  const useConfigured = !gmail || aliasAllowed;
  const address = useConfigured ? configured || fallback : fallback || configured;
  const name = displayNameOf(mailFrom) || COMPANY_NAME;
  const overridden = Boolean(
    gmail && !aliasAllowed && configured && fallback && configured.toLowerCase() !== fallback.toLowerCase()
  );

  // The mode describes the address that was actually resolved, not the flag that was set: with
  // the alias allowed but MAIL_FROM empty or equal to the account, the From really is the account
  // and labelling it "alias" would contradict the send it is attached to.
  const resolved = address.toLowerCase();
  const usedConfigured = Boolean(configured) && resolved === configured.toLowerCase();
  const usedAccount = Boolean(fallback) && resolved === fallback.toLowerCase();
  const mode = !gmail ? 'relay' : usedConfigured && !usedAccount ? 'alias' : 'account';

  return {
    name,
    address,
    from: address ? `${name} <${address}>` : String(mailFrom || ''),
    // How the From was decided, so a send can be traced back to its setting
    mode,
    configuredAddress: configured,
    aliasVerified: aliasAllowed,
    overridden
  };
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
const DISCLOSURE = 'You are receiving this one-off business note because your business is publicly listed.';

// The disclosure and the opt-out belong to the signature the agent already wrote: they continue
// that block rather than opening a second sign-off. A body that already carries the opt-out (the
// compose screen builds the full signature) is left exactly as it is, so an email can only ever
// end once. No postal address is added: it is not to appear in the messages the team sends.
const withFooter = (body) => {
  const text = String(body || '').trim();
  if (text.includes(OPT_OUT_LINE)) return text;

  // A message that already ends in a signature continues that block directly; one that has no
  // signature (a quote, for instance) gets a blank line so the identity does not run into it.
  const separator = /best regards,?\s*\n/i.test(text) ? '\n' : '\n\n';
  const identity = `${DISCLOSURE} ${OPT_OUT_LINE}`;
  return text ? `${text}${separator}${identity}` : identity;
};

// Handed to the compose screen so the signature it builds already carries these lines
const signatureFooter = () => ({ disclosure: DISCLOSURE, optOut: OPT_OUT_LINE });

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
  addressOf,
  resolveSender,
  aliasIsVerified,
  replyTo,
  cleanSubject,
  withFooter,
  signatureFooter,
  unsubscribeHeaders,
  DISCLOSURE,
  OPT_OUT_LINE
};
