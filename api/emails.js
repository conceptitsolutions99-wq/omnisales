// Vercel serverless function: sends outreach email through Gmail SMTP.
// The app password only ever lives in environment variables, never in the browser bundle.
const nodemailer = require('nodemailer');
const auth = require('../lib/auth-core');

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

  const session = auth.requireSession(req, res);
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

  const { to, subject, body, leadId, leadName, company, sentBy } = req.body || {};

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

  try {
    const info = await transporter.sendMail({
      from: mailFrom,
      to: entry.to,
      subject,
      text: body,
      // Lets the reply tracker attribute an answer to the agent who wrote it
      headers: {
        'X-Concept-Agent': entry.sentBy,
        'X-Concept-Lead': entry.leadName || entry.company || ''
      }
    });

    entry.status = 'sent';
    entry.providerId = info.messageId || null;
    deliveries.unshift(entry);
    return res.status(200).json({ ok: true, email: entry });
  } catch (err) {
    entry.status = 'failed';
    entry.error = err.message || 'Sending failed.';
    deliveries.unshift(entry);
    return res.status(502).json({ error: entry.error, email: entry });
  }
};
