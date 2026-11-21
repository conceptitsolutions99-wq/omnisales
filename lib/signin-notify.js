// Admin notes about sign-ins go through the same Gmail/relay account the team sends outreach
// from. They are best effort: a failure is only logged, and a slow SMTP server may delay a
// login by at most SEND_TIMEOUT_MS.
const nodemailer = require('nodemailer');
const deliverability = require('./mail-deliverability');
const notifyStatus = require('./signin-notify-status');

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

const disabled = () => /^(0|false|no|off)$/i.test(String(process.env.SIGNIN_NOTIFY_ENABLED ?? '').trim());

// Defaults to the admin login address, which is the person who manages staff accounts
const recipient = () => String(process.env.SIGNIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || '').trim();

const clientIp = (req) =>
  String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim() ||
  req?.socket?.remoteAddress ||
  'unknown';

const deviceOf = (req) => String(req?.headers?.['user-agent'] || '').replace(/\s+/g, ' ').trim().slice(0, 180);

const oneLine = (value) => String(value || '').replace(/[\r\n]+/g, ' ').trim();

const sendAdminNote = async ({ subject, lines, replyTo = '', event }) => {
  if (disabled()) return { sent: false, reason: 'disabled' };

  const to = recipient();
  if (!to) return { sent: false, reason: 'no-recipient' };
  if (!smtpUser || !smtpPass) return { sent: false, reason: 'not-configured' };

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
        to,
        ...(replyTo ? { replyTo } : {}),
        subject: oneLine(subject).slice(0, 140),
        text: lines.join('\n')
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${SEND_TIMEOUT_MS}ms`)), SEND_TIMEOUT_MS);
      })
    ]);
    return { sent: true, id: info.messageId };
  } catch (err) {
    console.error(`Could not email the ${event}: ${err.message} (${SMTP_HOST}:${SMTP_PORT})`);
    return { sent: false, reason: 'failed', error: err.message };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const notifySignIn = async ({ account, req }) => {
  // Admins already know when they sign in; the note is about the people they manage
  if (account.role === 'Admin' || account.permissions?.admin) {
    return { sent: false, reason: 'admin' };
  }

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
  ].filter(Boolean);

  const result = await sendAdminNote({
    subject: `Sign-in: ${account.name} (${account.role})`,
    lines,
    replyTo: account.email,
    event: 'sign-in notification'
  });

  // Keep the outcome where an admin can see it. A silent failure here was indistinguishable
  // from "no staff signed in", which is the one thing this note exists to prevent.
  await notifyStatus.record({
    sent: result.sent,
    reason: result.reason || (result.sent ? 'sent' : 'unknown'),
    to: recipient(),
    error: result.error
  });

  return result;
};

// The alert names the account, the last IP and the time. No password argument exists here, so
// neither the attempted password nor the correct one can end up in the message.
const buildFailedSignInNotice = ({ account, ip, attempts, at, device }) => {
  const lines = [
    'Several wrong passwords were entered for this account in a row.',
    '',
    `Account: ${oneLine(account.name)} <${oneLine(account.email)}>`,
    `Role: ${oneLine(account.role) || 'unknown'}`,
    `Consecutive failed attempts: ${Number(attempts) || 0}`,
    `Last attempt: ${new Date(at || Date.now()).toUTCString()}`,
    `IP: ${oneLine(ip) || 'unknown'}`,
    `Device: ${oneLine(device) || 'not reported'}`,
    '',
    'No password was recorded: neither the attempted password nor the correct one is in this message.',
    'If this was not expected, suspend the account under Admin, then Staff.'
  ];

  return {
    subject: `Failed sign-ins: ${oneLine(account.name)} (${oneLine(account.email)})`,
    text: lines.join('\n')
  };
};

// One account collecting wrong passwords is reported per account. A source that tries one or two
// passwords against many accounts never triggers that, so the IP's throttle reports the addresses
// instead. Only addresses are listed: no attempted password and no correct one is available here.
// A suspended account presenting its real password is a different event from a wrong password:
// the sign-in is refused, but the credential itself is still usable, so it has to be replaced
const buildSuspendedSignInNotice = ({ account, ip, at, device }) => {
  const lines = [
    'A suspended account tried to sign in with its correct password.',
    '',
    `Account: ${oneLine(account.name)} <${oneLine(account.email)}>`,
    `Role: ${oneLine(account.role) || 'unknown'}`,
    `Attempt: ${new Date(at || Date.now()).toUTCString()}`,
    `IP: ${oneLine(ip) || 'unknown'}`,
    `Device: ${oneLine(device) || 'not reported'}`,
    '',
    'Sign-in is blocked by the suspension, but the password still works, so whoever holds it can keep trying it. Reset the password or delete the account under Admin, then Staff.',
    'No password was recorded: neither the attempted password nor the correct one is in this message.'
  ];

  return {
    subject: `Suspended account sign-in: ${oneLine(account.name)} (${oneLine(account.email)})`,
    text: lines.join('\n')
  };
};

const notifySuspendedSignIn = async ({ account, req, ip, at }) => {
  const notice = buildSuspendedSignInNotice({ account, ip, at, device: deviceOf(req) });

  return sendAdminNote({
    subject: notice.subject,
    lines: notice.text.split('\n'),
    event: 'suspended account alert'
  });
};

const MAX_LISTED_ADDRESSES = 25;

const buildThrottledIpNotice = ({ ip, emails = [], distinctAccounts, attempts, first, at, device }) => {
  const addresses = (Array.isArray(emails) ? emails : [])
    .map((value) => oneLine(value).toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_LISTED_ADDRESSES);
  const listed = addresses.map((address) => `- ${address}`);
  const remaining = (Array.isArray(emails) ? emails.length : 0) - addresses.length;

  const lines = [
    'One address tripped the sign-in throttle: several failed sign-ins in a row from the same IP.',
    '',
    `IP: ${oneLine(ip) || 'unknown'}`,
    `Failed attempts in the window: ${Number(attempts) || 0}`,
    `Distinct accounts hit: ${Number.isFinite(Number(distinctAccounts)) ? Number(distinctAccounts) : addresses.length}`,
    `First attempt: ${new Date(first || at || Date.now()).toUTCString()}`,
    `Last attempt: ${new Date(at || Date.now()).toUTCString()}`,
    `Device: ${oneLine(device) || 'not reported'}`,
    '',
    'Accounts it tried:',
    ...(listed.length ? listed : ['- none recorded']),
    ...(remaining > 0 ? [`- and ${remaining} more`] : []),
    '',
    'No password was recorded: neither the attempted passwords nor the correct one is in this message.',
    'If this was not expected, review the accounts above under Admin, then Staff.'
  ];

  return {
    subject: `Sign-in throttle: ${oneLine(ip) || 'unknown IP'}`,
    text: lines.join('\n')
  };
};

const notifyThrottledIp = async ({ ip, emails, distinctAccounts, attempts, first, req }) => {
  const notice = buildThrottledIpNotice({
    ip,
    emails,
    distinctAccounts,
    attempts,
    first,
    at: Date.now(),
    device: deviceOf(req)
  });

  return sendAdminNote({
    subject: notice.subject,
    lines: notice.text.split('\n'),
    event: 'sign-in throttle alert'
  });
};

const notifyFailedSignIns = async ({ account, req, ip, attempts, at }) => {
  const notice = buildFailedSignInNotice({ account, ip, attempts, at, device: deviceOf(req) });

  return sendAdminNote({
    subject: notice.subject,
    lines: notice.text.split('\n'),
    event: 'failed sign-in alert'
  });
};

module.exports = {
  notifySignIn,
  notifyFailedSignIns,
  notifyThrottledIp,
  notifySuspendedSignIn,
  buildFailedSignInNotice,
  buildThrottledIpNotice,
  buildSuspendedSignInNotice
};
