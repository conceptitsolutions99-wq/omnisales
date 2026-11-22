// Vercel serverless function: sends outreach email through Gmail SMTP.
// The app password only ever lives in environment variables, never in the browser bundle.
const nodemailer = require('nodemailer');
const auth = require('../lib/auth-core');
const deliverability = require('../lib/mail-deliverability');
const sentStore = require('../lib/replies-store');
const requirementsStore = require('../lib/requirements-store');
const testMail = require('../lib/deliverability-test');
const suppression = require('../lib/suppression-store');
const emailLogStore = require('../lib/email-log-store');
const notifyStatus = require('../lib/signin-notify-status');
const deliveryResult = require('../lib/delivery-result');
const sendPacing = require('../lib/send-pacing');
const contactGuard = require('../lib/contact-guard');
const leadsStore = require('../lib/leads-store');
const authResults = require('../lib/auth-results');
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

// A warm instance answers fastest, but the shared store is what survives a cold start and what
// a second device reads; the in-memory list only fills the gap while that store is unreachable
const deliveries = [];

const recordDelivery = async (entry) => {
  deliveries.unshift(entry);
  try {
    await emailLogStore.record(entry);
    return { logged: true, error: null };
  } catch (err) {
    // The message has already left, so the send still counts; what the caller must not be told is
    // that the history has the row. The failure travels back with the send's own result.
    const line = JSON.stringify({
      at: new Date().toISOString(),
      level: 'error',
      event: 'delivery_log_failed',
      id: entry.id,
      status: entry.status,
      message: err.message
    });
    console.error(line);
    return { logged: false, error: err.message };
  }
};

// The shared log is the history; a warm entry for the same id carries the latest status
const mergeDeliveryLog = (stored, warm) => {
  const byId = new Map();
  for (const entry of stored) byId.set(entry.id, entry);
  for (const entry of warm) {
    const existing = byId.get(entry.id);
    byId.set(entry.id, existing ? { ...existing, ...entry } : entry);
  }
  return [...byId.values()].sort((a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || '')));
};

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

  const session = await auth.requireActiveSession(req, res);
  if (!session) return;

  // Every outgoing message carries a link that names its own recipient, so a click opts out only
  // that address and the send path can refuse it afterwards
  const origin = (process.env.APP_ORIGIN || `https://${req.headers.host || 'omnisales-delta.vercel.app'}`).replace(/\/$/, '');
  const unsubscribeUrlFor = (address) =>
    origin ? `${origin}/api/emails?unsubscribe=${encodeURIComponent(createUnsubscribeToken(address))}` : '';

  if (req.method === 'GET') {
    // Asked before composing: has another agent already written to this prospect?
    const checkTo = String((req.query && req.query.checkTo) || '').trim();
    const checkLeadId = (req.query && req.query.checkLeadId) || null;
    if (checkTo || checkLeadId) {
      const [conflict, replied] = await Promise.all([
        contactGuard.findConflict({ to: checkTo, leadId: checkLeadId, sentBy: session.name }),
        contactGuard.findUnansweredReply({ to: checkTo, leadId: checkLeadId })
      ]);
      return res.status(200).json({ conflict, replied });
    }

    // The table filters by sender in the browser, but hiding rows is not access control: this
    // response only carries an agent's own sends. Admins review the whole team's history.
    // Visibility follows the address stored with the send, because a display name can be
    // changed by the employee; older rows without it fall back to the name they were written with.
    const viewerIsAdmin = auth.isAdmin(session);
    const viewerEmail = String(session.email || '').trim().toLowerCase();
    const viewerName = String(session.name || '').trim();
    const canSee = (entry) => {
      if (viewerIsAdmin) return true;
      const owner = String(entry.sentByEmail || '').trim().toLowerCase();
      if (owner) return Boolean(viewerEmail) && owner === viewerEmail;
      return Boolean(viewerName) && String(entry.sentBy || '').trim() === viewerName;
    };
    const stored = await emailLogStore.list(300);
    // A row an admin removed stays removed, even when this instance still holds its own copy
    const deleted = await emailLogStore.deletedIds();
    const gone = new Set(deleted.map(String));
    const emails = mergeDeliveryLog(stored, deliveries)
      .filter((entry) => !gone.has(String(entry.id)))
      .filter(canSee)
      .slice(0, 50);
    return res.status(200).json({
      configured: Boolean(transporter),
      from: SENDER.from,
      fromMode: SENDER.mode,
      fromOverridden: SENDER.overridden,
      signature: deliverability.signatureFooter(),
      sender: smtpUser,
      // The remaining allowance travels with the log: the compose card reads it before sending
      rateLimit: await sendPacing.status(),
      emails,
      // The browser's own copy of what it sent drops these instead of merging them back
      deleted,
      // Admins also see whether the last note of each kind reached anyone. This is an admin panel
      // fact, so it is not put on the response an agent gets.
      ...(auth.isAdmin(session) ? { notifyStatus: await notifyStatus.readAll() } : {})
    });
  }

  // Removing rows from the delivery log is an admin action, and it covers the whole team: the log
  // is the shared record of what left the mailbox, so an agent cannot erase their own sends.
  if (req.method === 'DELETE') {
    if (!auth.isAdmin(session)) {
      return res.status(403).json({ error: 'Only an admin can delete delivery log rows.' });
    }

    const ids = Array.isArray(req.body?.ids)
      ? [...new Set(req.body.ids.map(String).filter(Boolean))].slice(0, 500)
      : [];
    if (ids.length === 0) {
      return res.status(400).json({ error: 'Choose at least one delivery to delete.' });
    }

    const remaining = await emailLogStore.deleteEntries(ids);
    // This instance's warm copy would otherwise merge the rows straight back into the answer
    const removed = new Set(ids);
    for (let index = deliveries.length - 1; index >= 0; index -= 1) {
      if (removed.has(String(deliveries[index].id))) deliveries.splice(index, 1);
    }

    return res.status(200).json({
      ok: true,
      removed: ids.length,
      deleted: await emailLogStore.deletedIds(),
      emails: mergeDeliveryLog(remaining, deliveries).slice(0, 50)
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Use GET, POST or DELETE.' });
  }

  const { to, subject, body, leadId, leadName, company, sentBy, requirements, test, confirmSharedContact, confirmRepliedContact } = req.body || {};

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
      // The address is the stable identity; a display name can change in the profile
      sentByEmail: String(session.email || '').toLowerCase(),
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
      const delivery = await recordDelivery(entry);
      logSender('email_test_sent', { to: entry.to, messageId: entry.providerId });

      // Read the delivered copy back over IMAP, so the report shows the receiver's own SPF, DKIM
      // and DMARC verdicts rather than the fact that SMTP accepted the message
      const authentication = await authResults
        .findDeliveredTest({ user: smtpUser, pass: smtpPass, messageId: entry.providerId })
        .catch((err) => ({ found: false, reason: err.message }));

      return res.status(200).json({
        ok: true,
        test: true,
        email: entry,
        from: SENDER.from,
        fromMode: SENDER.mode,
        messageId: entry.providerId,
        accepted: result.accepted,
        rejected: result.rejected,
        authentication,
        ...deliveryResult.report(delivery)
      });
    } catch (err) {
      entry.status = 'failed';
      entry.error = err.message || 'The test email could not be sent.';
      const delivery = await recordDelivery(entry);
      logSender('email_test_failed', { to: entry.to, error: entry.error });
      return res.status(502).json({
        error: entry.error,
        email: entry,
        from: SENDER.from,
        fromMode: SENDER.mode,
        ...deliveryResult.report(delivery)
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

  // A prospect who answered is not a follow-up target: refuse until the agent confirms that
  // this message is a deliberate reply to them, not the next step of the sequence
  const replied = await contactGuard.findUnansweredReply({ to: String(to).trim(), leadId });
  if (replied && !confirmRepliedContact) {
    return res.status(409).json({
      error: contactGuard.replyMessageFor(replied),
      replied,
      requiresConfirmation: true
    });
  }

  // Two lists can hold the same business: block a second agent before the duplicate goes out,
  // unless they have seen who wrote first and chosen to send anyway
  const conflict = await contactGuard.findConflict({ to: String(to).trim(), leadId, sentBy: session.name });
  if (conflict && !confirmSharedContact) {
    return res.status(409).json({
      error: contactGuard.messageFor(conflict),
      conflict,
      requiresConfirmation: true
    });
  }

  if (!transporter) {
    return res.status(503).json({
      error: 'Email sending is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to the environment variables, then redeploy.'
    });
  }

  // Reputation guard: the mailbox is shared, so its ceiling belongs to the team, not to whoever
  // is at the keyboard. The slot is taken before any side effect and given back if SMTP fails.
  const slot = await sendPacing.reserve();
  if (!slot.ok) {
    return res.status(429).json({
      error: sendPacing.messageFor(slot),
      reason: slot.reason,
      rateLimit: slot
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
    sentByEmail: String(session.email || '').toLowerCase(),
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
    const delivery = await recordDelivery(entry);
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

    // Ownership is recorded server-side, so every device sees whose conversation this is
    await leadsStore
      .claimLead({ id: entry.leadId, email: entry.to }, session)
      .catch((err) => console.error('Could not record the lead owner:', err.message));

    return res.status(200).json({
      ok: true,
      email: entry,
      ...deliveryResult.report(delivery),
      rateLimit: await sendPacing.status()
    });
  } catch (err) {
    // A message SMTP refused never reached the mailbox, so its slot goes back
    if (entry.status !== 'sent') await sendPacing.release(slot.stamp);
    entry.status = 'failed';
    entry.error = err.message || 'Sending failed.';
    const delivery = await recordDelivery(entry);
    logSender('email_failed', { agent: entry.sentBy, error: entry.error });
    return res.status(502).json({
      error: entry.error,
      email: entry,
      ...deliveryResult.report(delivery)
    });
  }
};
