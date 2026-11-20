// A staff sign-in is worth knowing about: a temporary password shared over chat, a mailbox
// someone else has, a login at an odd hour. This sends the admin a short note through the same
// Gmail account the team already sends outreach from, so there is no second provider to
// configure. It never blocks or changes the sign-in result: a mail failure is only logged.
const nodemailer = require('nodemailer');
const deliverability = require('./mail-deliverability');

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

const disabled = () => /^(0|false|no|off)$/i.test(String(process.env.SIGNIN_NOTIFY_ENABLED ?? '').trim());

// Defaults to the admin login address, which is the person who manages staff accounts
const recipient = () => String(process.env.SIGNIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || '').trim();

// Admins already know when they sign in; the note is about the people they manage
const isEmployee = (account) =>
  Boolean(account) && account.role !== 'Admin' && !account.permissions?.admin;

const clientIp = (req) =>
  (String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim() ||
    req?.socket?.remoteAddress ||
    'unknown');

const deviceOf = (req) => String(req?.headers?.['user-agent'] || '').replace(/\s+/g, ' ').trim().slice(0, 180);

const oneLine = (value) => String(value || '').replace(/[\r\n]+/g, ' ').trim();

const notifySignIn = async ({ account, req }) => {
  if (disabled()) return { sent: false, reason: 'disabled' };
  if (!isEmployee(account)) return { sent: false, reason: 'admin' };

  const to = recipient();
  if (!to) return { sent: false, reason: 'no-recipient' };
  if (!smtpUser || !smtpPass) return { sent: false, reason: 'not-configured' };

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: smtpUser, pass: smtpPass },
    connectionTimeout: 6000,
    greetingTimeout: 6000,
    socketTimeout: 7000
  });

  const firstSignIn = Boolean(account.mustChangePassword);
  const lines = [
    `${account.name} signed in to the outbound system.`,
    '',
    `Account: ${account.email}`,
    `Role: ${account.role}`,
    `Time: ${new Date().toUTCString()}`,
    `IP: ${clientIp(req)}`,
    `Device: ${deviceOf(req) || 'not reported'}`,
    firstSignIn ? 'Note: this is the first sign-in with a temporary password.' : '',
    '',
    'If this was not expected, suspend the account under Admin, then Staff.'
  ].filter((line) => line !== '');

  try {
    const info = await transporter.sendMail({
      from: SENDER.from,
      to,
      replyTo: account.email,
      subject: oneLine(`Sign-in: ${account.name} (${account.role})`).slice(0, 140),
      text: lines.join('\n')
    });
    return { sent: true, id: info.messageId };
  } catch (err) {
    console.error(
      `Could not email the sign-in notification: ${err.message} (${SMTP_HOST}:${SMTP_PORT})`
    );
    return { sent: false, reason: 'failed', error: err.message };
  }
};

module.exports = {
  notifySignIn,
  isEmployee,
  recipient,
  enabled: () => !disabled() && Boolean(recipient()) && Boolean(smtpUser && smtpPass)
};
