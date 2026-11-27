// A customer who fills in the form an agent pasted into WhatsApp has told us what they want, so
// the admin and the agent who shared the form both get a note by email. The note is best effort:
// the submission is already saved, and a slow or broken mailbox must not fail the customer's page.
const nodemailer = require('nodemailer');
const deliverability = require('./mail-deliverability');
const { labelFor } = require('./requirements-store');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const configuredPort = Number.parseInt(process.env.SMTP_PORT || '', 10);
const SMTP_PORT = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 465;
const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER || '';
const smtpPass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const mailFrom = process.env.MAIL_FROM || (smtpUser ? `Concept IT Solutions <${smtpUser}>` : '');

const SENDER = deliverability.resolveSender({
  smtpHost: SMTP_HOST,
  smtpUser,
  mailFrom,
  aliasVerified: process.env.GMAIL_FROM_ALIAS_VERIFIED
});

const SEND_TIMEOUT_MS = 3000;
const MAX_LISTED_OPTIONS = 80;

const oneLine = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

// The admin (or the address set for these notes) and the agent who sent the form. Deduplicated,
// so an admin working their own lead gets one message and not two.
const recipients = (request) => {
  const list = [
    process.env.REQUIREMENTS_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || '',
    request?.agentEmail || ''
  ]
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);

  return [...new Set(list)].slice(0, 4);
};

const buildSubmissionNotice = ({ request, origin }) => {
  const details = request?.details && typeof request.details === 'object' ? request.details : {};
  const answers = request?.answers && typeof request.answers === 'object' ? request.answers : {};
  const chosen = Object.values(answers)
    .flat()
    .filter(Boolean)
    .map(oneLine)
    .filter(Boolean);

  const label = labelFor(request?.type);
  const who =
    oneLine(request?.company) || oneLine(request?.leadName) || oneLine(request?.leadEmail) || 'A customer';

  const lines = [
    `A customer submitted the ${label} you shared.`,
    '',
    `Customer: ${oneLine(request?.leadName) || 'not given'}`,
    `Company: ${oneLine(request?.company) || 'not given'}`,
    `Email: ${oneLine(request?.leadEmail) || 'not given'}`,
    `Phone: ${oneLine(details.phone) || 'not given'}`,
    `Budget: ${oneLine(details.budget) || 'not given'}`,
    `Needed by: ${oneLine(details.deadline) || 'not given'}`,
    `Shared by: ${oneLine(request?.agent) || 'unknown'}`,
    `Answered: ${new Date(request?.submittedAt || Date.now()).toUTCString()}`,
    '',
    'Their idea:',
    oneLine(details.description) || 'not written',
    '',
    `What they ticked (${chosen.length}):`,
    ...(chosen.length ? chosen.slice(0, MAX_LISTED_OPTIONS).map((option) => `- ${option}`) : ['- nothing ticked']),
    ...(chosen.length > MAX_LISTED_OPTIONS ? [`- and ${chosen.length - MAX_LISTED_OPTIONS} more`] : []),
    '',
    `The answers are in the app under Requirements: ${origin}`
  ];

  return {
    subject: `Requirements answered — ${who} (${label})`,
    text: lines.join('\n')
  };
};

const notifySubmission = async ({ request, origin }) => {
  const to = recipients(request);
  if (!to.length) return { sent: false, reason: 'no-recipient' };
  if (!smtpUser || !smtpPass) return { sent: false, reason: 'not-configured' };

  const notice = buildSubmissionNotice({ request, origin });

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: smtpUser, pass: smtpPass },
    connectionTimeout: 2500,
    greetingTimeout: 2500,
    socketTimeout: 3000
  });

  let timer = null;
  try {
    const info = await Promise.race([
      transporter.sendMail({
        from: SENDER.from,
        to: to.join(', '),
        subject: oneLine(notice.subject).slice(0, 140),
        text: notice.text
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${SEND_TIMEOUT_MS}ms`)), SEND_TIMEOUT_MS);
      })
    ]);
    return { sent: true, id: info.messageId, to };
  } catch (err) {
    console.error(`Could not email the requirements submission: ${err.message} (${SMTP_HOST}:${SMTP_PORT})`);
    return { sent: false, reason: 'failed', error: err.message, to };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

module.exports = {
  notifySubmission,
  buildSubmissionNotice,
  recipients
};
