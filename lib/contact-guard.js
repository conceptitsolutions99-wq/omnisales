// Two agents can pick the same business from two different lists. The mailbox is shared, so the
// prospect sees the same address twice on the same day. This checks who else already wrote to a
// prospect recently, matching the address itself, the company domain and the phone number.
// The check runs on the server before an email is sent, so it cannot be skipped by the UI.
const emailLogStore = require('./email-log-store');
const leadsStore = require('./leads-store');

const positiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

// How long a contact by another agent blocks a duplicate send (with an explicit override in the UI)
const WINDOW_HOURS = positiveInt(process.env.LEAD_CONTACT_WINDOW_HOURS, 24);

// Free mailboxes are not a company identity: two gmail.com leads are not the same business
const PUBLIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'live.co.uk', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com',
  'gmx.com', 'gmx.net', 'mail.com', 'zoho.com', 'yandex.com', 'mail.ru'
]);

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const emailDomain = (value) => {
  const email = normalizeEmail(value);
  const at = email.lastIndexOf('@');
  return at > 0 ? email.slice(at + 1) : '';
};

// A website and an email address often point at the same company, so both become one hostname
const websiteDomain = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./i, '').toLowerCase();
  } catch (err) {
    return '';
  }
};

const matchableDomain = (value) => {
  const domain = String(value || '').trim().toLowerCase();
  return domain && !PUBLIC_DOMAINS.has(domain) ? domain : '';
};

// Same rule as the lead store: the last ten digits identify the number across formatting
const phoneDigits = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : '';
};

const phoneOfLead = (lead) =>
  phoneDigits(lead?.phone || lead?.displayPhone || lead?.mobile || lead?.whatsapp);

const MATCH_LABELS = {
  email: 'the same email address',
  domain: 'the same company domain',
  phone: 'the same phone number'
};

const conflictFrom = (entry, matchedBy, lead) => ({
  matchedBy,
  label: MATCH_LABELS[matchedBy] || matchedBy,
  agent: String(entry.sentBy || '').trim(),
  sentAt: entry.sentAt || '',
  to: entry.to || '',
  leadName: entry.leadName || lead?.name || '',
  subject: entry.subject || ''
});

const findConflict = async ({ to = '', leadId = null, sentBy = '' } = {}) => {
  const targetEmail = normalizeEmail(to);
  const hasLeadId = leadId !== null && leadId !== undefined && String(leadId).trim() !== '';
  if (!targetEmail && !hasLeadId) return null;

  let logs = [];
  let leads = [];
  try {
    [logs, leads] = await Promise.all([emailLogStore.list(200), leadsStore.listLeads()]);
  } catch (err) {
    // The send path also records the message; a failed duplicate check must not hide that
    console.error('Could not check for a duplicate contact:', err.message);
    return null;
  }

  const targetLead = leads.find(
    (lead) =>
      (hasLeadId && String(lead.id) === String(leadId)) ||
      (targetEmail && normalizeEmail(lead.email) === targetEmail)
  );

  const targetPhone = phoneOfLead(targetLead);
  const targetDomains = new Set(
    [emailDomain(targetEmail), websiteDomain(targetLead?.website)].map(matchableDomain).filter(Boolean)
  );

  const byLeadId = new Map(leads.map((lead) => [String(lead.id), lead]));
  const cutoff = Date.now() - WINDOW_HOURS * 60 * 60 * 1000;
  const me = String(sentBy || '').trim();

  for (const entry of logs) {
    if (!entry || entry.status !== 'sent') continue;
    const agent = String(entry.sentBy || '').trim();
    // A follow-up by the same agent is their own conversation, not a collision
    if (!agent || agent === me) continue;
    const sentAt = new Date(entry.sentAt || '').getTime();
    if (!Number.isFinite(sentAt) || sentAt < cutoff) continue;

    const entryLead = byLeadId.get(String(entry.leadId));
    const entryEmail = normalizeEmail(entry.to);

    if (targetEmail && entryEmail === targetEmail) {
      return conflictFrom(entry, 'email', entryLead);
    }

    if (targetDomains.size > 0) {
      const entryDomains = [
        matchableDomain(emailDomain(entryEmail)),
        matchableDomain(websiteDomain(entryLead?.website))
      ].filter(Boolean);
      if (entryDomains.some((domain) => targetDomains.has(domain))) {
        return conflictFrom(entry, 'domain', entryLead);
      }
    }

    const entryPhone = phoneOfLead(entryLead);
    if (targetPhone && entryPhone && targetPhone === entryPhone) {
      return conflictFrom(entry, 'phone', entryLead);
    }
  }

  return null;
};

// A prospect who answered is not a follow-up target. The reply stays unanswered until an
// outbound message newer than it exists, so writing back deliberately is still allowed.
const findUnansweredReply = async ({ to = '', leadId = null } = {}) => {
  const targetEmail = normalizeEmail(to);
  const hasLeadId = leadId !== null && leadId !== undefined && String(leadId).trim() !== '';
  if (!targetEmail && !hasLeadId) return null;

  let logs = [];
  let leads = [];
  try {
    [logs, leads] = await Promise.all([emailLogStore.list(200), leadsStore.listLeads()]);
  } catch (err) {
    console.error('Could not check for an answered prospect:', err.message);
    return null;
  }

  const lead = leads.find(
    (row) =>
      (hasLeadId && String(row.id) === String(leadId)) ||
      (targetEmail && normalizeEmail(row.email) === targetEmail)
  );
  if (!lead?.repliedAt) return null;

  const repliedAt = new Date(lead.repliedAt).getTime();
  if (!Number.isFinite(repliedAt)) return null;

  const lastOutbound = logs
    .filter((entry) => entry && entry.status === 'sent')
    .filter(
      (entry) =>
        (targetEmail && normalizeEmail(entry.to) === targetEmail) ||
        (hasLeadId && String(entry.leadId) === String(leadId))
    )
    .map((entry) => new Date(entry.sentAt || '').getTime())
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => b - a)[0];

  // A message newer than the reply is already the answer back
  if (lastOutbound && lastOutbound > repliedAt) return null;

  return {
    repliedAt: lead.repliedAt,
    from: lead.repliedFrom || targetEmail || '',
    subject: lead.repliedSubject || '',
    agent: lead.replyAgent || '',
    leadName: lead.name || lead.company || ''
  };
};

const replyMessageFor = (reply) => {
  const when = reply?.repliedAt ? new Date(reply.repliedAt).toLocaleString() : 'recently';
  const who = reply?.from || 'This prospect';
  const subject = reply?.subject ? ` about "${reply.subject}"` : '';
  return `${who} replied on ${when}${subject}. Outreach to a prospect who answered is paused — reply to them deliberately, or confirm this send.`;
};

const messageFor = (conflict) => {
  const when = conflict?.sentAt ? new Date(conflict.sentAt).toLocaleString() : 'recently';
  const who = conflict?.agent || 'Another agent';
  const prospect = conflict?.leadName || conflict?.to || 'this prospect';
  return `${who} already contacted ${prospect} (${conflict?.to || 'same address'}) on ${when} — matched by ${conflict?.label || 'the same details'}. Sending again would put the same company in front of two agents in ${WINDOW_HOURS} hours. Confirm only if this is deliberate.`;
};

module.exports = {
  findConflict,
  findUnansweredReply,
  messageFor,
  replyMessageFor,
  windowHours: WINDOW_HOURS,
  // Exported for the unit check and any future dedupe screen
  normalizeEmail,
  emailDomain,
  websiteDomain,
  phoneDigits
};
