// Vercel serverless function: sends outreach email through Gmail SMTP.
// The app password only ever lives in environment variables, never in the browser bundle.
const nodemailer = require('nodemailer');
const auth = require('../lib/auth-core');
const sentStore = require('../lib/replies-store');
const requirementsStore = require('../lib/requirements-store');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const configuredPort = Number.parseInt(process.env.SMTP_PORT || '', 10);
const SMTP_PORT = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 465;
const smtpUser = process.env.GMAIL_USER || '';
const smtpPass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const mailFrom = process.env.MAIL_FROM || (smtpUser ? `Concept IT Solutions <${smtpUser}>` : '');

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

  const session = auth.requireActiveSession(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    return res.status(200).json({
      configured: Boolean(transporter),
      from: mailFrom,
      sender: smtpUser,
      emails: deliveries.slice(0, 50)
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST.' });
  }

  const { to, subject, body, leadId, leadName, company, sentBy, requirements } = req.body || {};

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Recipient, subject and message are all required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to).trim())) {
    return res.status(400).json({ error: 'That recipient address does not look valid.' });
  }
  if (!transporter) {
    return res.status(503).json({
      error: 'Email sending is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to the environment variables, then redeploy.'
    });
  }

  const entry = {
    id: `em_${Date.now()}`,
    to: String(to).trim(),
    subject,
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
  const origin = (process.env.APP_ORIGIN || `https://${req.headers.host || 'omnisales-delta.vercel.app'}`).replace(/\/$/, '');
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

  try {
    const info = await transporter.sendMail({
      from: mailFrom,
      to: entry.to,
      subject,
      text: messageBody,
      // Lets the reply tracker attribute an answer to the agent who wrote it
      headers: {
        'X-Concept-Agent': entry.sentBy,
        'X-Concept-Lead': entry.leadName || entry.company || ''
      }
    });

    entry.status = 'sent';
    entry.providerId = info.messageId || null;
    entry.requirementsUrl = requirementsUrl;
    deliveries.unshift(entry);

    // Record who sent what, so the reply can be attributed even if the IMAP scan misses it
    await sentStore.rememberSent({
      messageId: info.messageId,
      agent: entry.sentBy,
      agentEmail: session.email,
      leadName: entry.leadName || entry.company,
      to: entry.to,
      subject,
      sentAt: entry.sentAt
    });

    return res.status(200).json({ ok: true, email: entry });
  } catch (err) {
    entry.status = 'failed';
    entry.error = err.message || 'Sending failed.';
    deliveries.unshift(entry);
    return res.status(502).json({ error: entry.error, email: entry });
  }
};
