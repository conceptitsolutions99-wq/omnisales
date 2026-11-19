// Vercel serverless function: sends outreach email through Gmail SMTP.
// The app password only ever lives in environment variables, never in the browser bundle.
const nodemailer = require('nodemailer');
const auth = require('../lib/auth-core');
const deliverability = require('../lib/mail-deliverability');
const sentStore = require('../lib/replies-store');
const requirementsStore = require('../lib/requirements-store');
const testMail = require('../lib/deliverability-test');
const suppression = require('../lib/suppression-store');
const unsubscribe = require('../lib/unsubscribe-page');
const { createUnsubscribeToken } = require('../lib/unsubscribe-token');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const configuredPort = Number.parseInt(process.env.SMTP_PORT || '', 10);
const SMTP_PORT = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 465;
// A relay behind SMTP_HOST authenticates with its own user and key, so those names win when set
const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER || '';
const smtpPass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const mailFrom = process.env.MAIL_FROM || (smtpUser ? `Concept IT Solutions <${smtpUser}>` : '');

// The From address has to belong to the mailbox that authenticated, or SPF/DKIM stop aligning
// and the message is filtered as forged. A verified Gmail alias is the one exception, and it is
// opt-in through GMAIL_FROM_ALIAS_VERIFIED so MAIL_FROM is never overridden without a word.
const SENDER = deliverability.resolveSender({
  smtpHost: SMTP_HOST,
  smtpUser,
  mailFrom,
  aliasVerified: process.env.GMAIL_FROM_ALIAS_VERIFIED
});

// Which From a message actually left with is part of the delivery record, not an assumption
const logSender = (event, fields = {}) => {
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      event,
      from: SENDER.from,
      fromMode: SENDER.mode,
      fromOverridden: SENDER.overridden,
      ...fields
    })
  );
};

const transporter = smtpPass && smtpUser
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: smtpUser, pass: smtpPass },
      // Keep a stalled SMTP session inside the function's time limit
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 9000
    })
  : null;

// Warm instances only: serverless has no writable disk, so the browser keeps its own copy
const deliveries = [];

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  // The unsubscribe route lives in this function because a deployment on this plan has a fixed
  // number of functions. It answers without a session: the signed token in the link is proof.
  const queryToken = (req.query && req.query.unsubscribe) || '';
  const urlToken =
    queryToken || (req.url ? new URL(req.url, 'http://localhost').searchParams.get('unsubscribe') : '') || '';
  const unsubscribeToken = String(urlToken);
  if (unsubscribeToken) {
    await unsubscribe.handleUnsubscribe(req, res, unsubscribeToken);
    return;
  }

  const session = auth.requireActiveSession(req, res);
  if (!session) return;

  // Every outgoing message carries a link that names its own recipient, so a click opts out only
  // that address and the send path can refuse it afterwards
  const origin = (process.env.APP_ORIGIN || `https://${req.headers.host || 'omnisales-delta.vercel.app'}`).replace(/\/$/, '');
  const unsubscribeUrlFor = (address) =>
    origin ? `${origin}/api/emails?unsubscribe=${encodeURIComponent(createUnsubscribeToken(address))}` : '';

  if (req.method === 'GET') {
    return res.status(200).json({
      configured: Boolean(transporter),
      from: SENDER.from,
      fromMode: SENDER.mode,
      fromOverridden: SENDER.overridden,
      signature: deliverability.signatureFooter(),
      sender: smtpUser,
      emails: deliveries.slice(0, 50)
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST.' });
  }

  const { to, subject, body, leadId, leadName, company, sentBy, requirements, test } = req.body || {};

  // A test goes only to the admin who asked for it, through the same transport and From as a real
  // outreach email, so a delivered test proves the path that outreach actually uses
  if (test) {
    if (!auth.isAdmin(session)) {
      return res.status(403).json({ error: 'Only an admin can send a deliverability test.' });
    }
    if (!transporter) {
      return res.status(503).json({
        error: 'Email sending is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to the environment variables, then redeploy.'
      });
    }

    const entry = {
      id: `em_test_${Date.now()}`,
      to: session.email,
      subject: testMail.TEST_SUBJECT,
      from: SENDER.from,
      fromMode: SENDER.mode,
      leadId: null,
      leadName: 'Deliverability test',
      company: 'Concept IT Solutions',
      sentBy: session.name || 'Admin',
      sentAt: new Date().toISOString(),
      status: 'sending',
      providerId: null,
      error: null,
      test: true
    };

    try {
      const result = await testMail.sendTestEmail({
        transporter,
        session,
        sender: SENDER,
        unsubscribeUrl: unsubscribeUrlFor(session.email)
      });
      entry.subject = result.subject;
      entry.sentAt = result.sentAt;
      entry.status = 'sent';
      entry.providerId = result.messageId;
      deliveries.unshift(entry);
      logSender('email_test_sent', { to: entry.to, messageId: entry.providerId });
      return res.status(200).json({
        ok: true,
        test: true,
        email: entry,
        from: SENDER.from,
        fromMode: SENDER.mode,
        messageId: entry.providerId,
        accepted: result.accepted,
        rejected: result.rejected
      });
    } catch (err) {
      entry.status = 'failed';
      entry.error = err.message || 'The test email could not be sent.';
      deliveries.unshift(entry);
      logSender('email_test_failed', { to: entry.to, error: entry.error });
      return res.status(502).json({
        error: entry.error,
        email: entry,
        from: SENDER.from,
        fromMode: SENDER.mode
      });
    }
  }

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Recipient, subject and message are all required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to).trim())) {
    return res.status(400).json({ error: 'That recipient address does not look valid.' });
  }
  // A suppression is a promise kept: an opt-out or a hard bounce is never written to again,
  // whichever agent is at the keyboard
  const blocked = await suppression.findSuppressed(to);
  if (blocked) {
    return res.status(409).json({
      error: `${blocked.email} is on the do-not-contact list (${String(blocked.reason || '').replace(/_/g, ' ')}), so this message was not sent.`,
      suppressed: true,
      email: blocked.email,
      reason: blocked.reason || ''
    });
  }

  if (!transporter) {
    return res.status(503).json({
      error: 'Email sending is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to the environment variables, then redeploy.'
    });
  }

  const subjectLine = deliverability.cleanSubject(subject);

  const entry = {
    id: `em_${Date.now()}`,
    to: String(to).trim(),
    subject: subjectLine,
    from: SENDER.from,
    fromMode: SENDER.mode,
    leadId: leadId ?? null,
    leadName: leadName || '',
    company: company || '',
    sentBy: session.name || sentBy || 'Unknown agent',
    sentAt: new Date().toISOString(),
    status: 'sending',
    providerId: null,
    error: null
  };

  // Email clients strip real form controls, so the requirements form travels as a link that
  // carries its own token; the customer's answers come back into the app.
  const formType = String(requirements || '').trim();
  let requirementsUrl = null;
  let messageBody = body;

  if (requirementsStore.TYPES.includes(formType)) {
    try {
      const request = await requirementsStore.createRequest({
        type: formType,
        leadId: entry.leadId ?? null,
        leadEmail: entry.to,
        leadName: entry.leadName,
        company: entry.company,
        agent: entry.sentBy,
        agentEmail: session.email
      });
      requirementsUrl = `${origin}/#/requirements/${request.token}`;
      messageBody = `${body}\n\n---\nProject requirements form\nTell us exactly what you need - open the link, tick the options and send it back:\n${requirementsUrl}\n\nIf you prefer, reply to this email with your answers and we will fill it in for you.\n`;
    } catch (err) {
      console.error('Could not create the requirements link:', err.message);
    }
  }

  const unsubscribeUrl = unsubscribeUrlFor(entry.to);
  messageBody = deliverability.withFooter(messageBody, { unsubscribeUrl });
  const replyTo = deliverability.replyTo(session.email, SENDER.address);

  try {
    const info = await transporter.sendMail({
      from: SENDER.from,
      to: entry.to,
      ...(replyTo ? { replyTo } : {}),
      subject: subjectLine,
      text: messageBody,
      // Lets the reply tracker attribute an answer to the agent who wrote it
      headers: {
        'X-Concept-Agent': entry.sentBy,
        'X-Concept-Lead': entry.leadName || entry.company || '',
        ...deliverability.unsubscribeHeaders(SENDER.address, unsubscribeUrl)
      }
    });

    entry.status = 'sent';
    entry.providerId = info.messageId || null;
    entry.requirementsUrl = requirementsUrl;
    deliveries.unshift(entry);
    logSender('email_sent', { agent: entry.sentBy, lead: entry.leadName || entry.company || '' });

    // Record who sent what, so the reply can be attributed even if the IMAP scan misses it
    await sentStore.rememberSent({
      messageId: info.messageId,
      agent: entry.sentBy,
      agentEmail: session.email,
      leadName: entry.leadName || entry.company,
      to: entry.to,
      subject: subjectLine,
      sentAt: entry.sentAt
    });

    return res.status(200).json({ ok: true, email: entry });
  } catch (err) {
    entry.status = 'failed';
    entry.error = err.message || 'Sending failed.';
    deliveries.unshift(entry);
    logSender('email_failed', { agent: entry.sentBy, error: entry.error });
    return res.status(502).json({ error: entry.error, email: entry });
  }
};
