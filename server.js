require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const twilio = require('twilio');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend build
app.use(express.static(path.join(__dirname, 'dist')));

// Twilio Credentials from environment or config
const accountSid = process.env.TWILIO_ACCOUNT_SID || 'AC_placeholder_sid';
const authToken = process.env.TWILIO_AUTH_TOKEN || 'placeholder_token';
const twilioNumber = process.env.TWILIO_PHONE_NUMBER || '+15550000000';
const twiMLAppSid = process.env.TWILIO_TWIML_APP_SID || 'AP_placeholder_app_sid';

// API: Generate Twilio Access Token for Browser WebRTC Softphone
app.get('/api/token', (req, res) => {
  const identity = req.query.identity || 'sales_agent';

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  // Create an access token which we will sign and return to the client
  const accessToken = new AccessToken(accountSid, authToken, process.env.TWILIO_API_KEY || '', {
    identity: identity
  });

  // Grant the access token Twilio Voice capabilities
  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: twiMLAppSid,
    incomingAllow: true
  });

  accessToken.addGrant(voiceGrant);

  res.json({
    token: accessToken.toJwt(),
    identity: identity
  });
});

// API: TwiML Voice Webhook (handles outbound calls to actual phone numbers)
app.post('/api/voice', (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const toNumber = req.body.To || req.query.To;

  if (toNumber) {
    const dial = twiml.dial({ callerId: twilioNumber });
    dial.number(toNumber);
  } else {
    twiml.say('Thanks for calling OmniSales IT Pro. Connecting your outbound call.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

/* ─────────────────────────  Transactional email (Resend)  ───────────────────────── */

// Gmail SMTP: sends as the configured Gmail address using a Google app password
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const configuredSmtpPort = Number.parseInt(process.env.SMTP_PORT || '', 10);
const SMTP_PORT = Number.isInteger(configuredSmtpPort) && configuredSmtpPort > 0 ? configuredSmtpPort : 465;
const smtpUser = process.env.GMAIL_USER || 'conceptitsolutions99@gmail.com';
const smtpPass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const mailFrom = process.env.MAIL_FROM || `OmniSales IT Solutions <${smtpUser}>`;

const transporter = smtpPass
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: smtpUser, pass: smtpPass }
    })
  : null;
const emailLogPath = path.join(__dirname, 'data', 'emails.json');

const readEmailLog = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(emailLogPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
};

const writeEmailLog = (entries) => {
  try {
    fs.mkdirSync(path.dirname(emailLogPath), { recursive: true });
    fs.writeFileSync(emailLogPath, JSON.stringify(entries.slice(0, 250), null, 2));
  } catch (err) {
    console.error('Could not persist email log:', err.message);
  }
};

// API: Send an outreach email and record the delivery attempt
app.post('/api/emails', async (req, res) => {
  const { to, subject, body, leadId, leadName, company, sentBy } = req.body || {};

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Recipient, subject and message are all required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to).trim())) {
    return res.status(400).json({ error: 'That recipient address does not look valid.' });
  }
  if (!transporter) {
    return res.status(503).json({
      error: `Email sending is not configured. Add GMAIL_APP_PASSWORD for ${smtpUser} to .env and restart the server.`
    });
  }

  const entry = {
    id: `em_${Date.now()}`,
    to: String(to).trim(),
    subject,
    body,
    leadId: leadId ?? null,
    leadName: leadName || '',
    company: company || '',
    sentBy: sentBy || 'Unknown agent',
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
      text: body
    });

    entry.status = 'sent';
    entry.providerId = info.messageId || null;
    writeEmailLog([entry, ...readEmailLog()]);
    res.json({ ok: true, email: entry });
  } catch (err) {
    entry.status = 'failed';
    entry.error = err.message || 'Sending failed.';
    writeEmailLog([entry, ...readEmailLog()]);
    res.status(502).json({ error: entry.error, email: entry });
  }
});

// API: Delivery log (most recent first)
app.get('/api/emails', (req, res) => {
  res.json({ configured: Boolean(transporter), from: mailFrom, sender: smtpUser, emails: readEmailLog() });
});

// Fallback to SPA index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Ignore an empty or zero PORT so the API always lands on a reachable port
const configuredPort = Number.parseInt(process.env.PORT || '', 10);
const PORT = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 3000;
app.listen(PORT, () => {
  console.log(`OmniSales Server running on port ${PORT}`);
});
