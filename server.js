require('dotenv').config();
// Prefer IPv4: some public APIs (Overpass) hang on IPv6 from Node's fetch
require('node:dns').setDefaultResultOrder('ipv4first');
const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const auth = require('./lib/auth-core');
const sentStore = require('./lib/replies-store');
const requirementsStore = require('./lib/requirements-store');
const { findEmails } = require('./lib/find-email');
const testMail = require('./lib/deliverability-test');
const leadsStore = require('./lib/leads-store');

const app = express();
// WhatsApp proofs travel as base64 screenshots, so the default 100 kB body cap is too small
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend build
app.use(express.static(path.join(__dirname, 'dist')));


/* ───────────────  Real business leads (OpenStreetMap Overpass)  ─────────────── */

// Free, no API key. Data © OpenStreetMap contributors, ODbL licence.
// osm.ch only carries Swiss data, so it is deliberately excluded
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

const REQUEST_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'ConceptITSolutions-Outbound/1.0'
};

// Retry across mirrors: the free instances regularly answer 429/502 when busy
const queryOverpass = async (query) => {
  let lastError = 'The map data service could not be reached.';

  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { ...REQUEST_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal
        });
        clearTimeout(timeout);

        if ([429, 502, 503, 504].includes(response.status)) {
          lastError = 'The free map service is busy right now. Please try again in a minute.';
          await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
          continue;
        }

        if (!response.ok) {
          lastError = `The map data service returned ${response.status}.`;
          break;
        }

        const payload = await response.json();

        // An empty payload can mean limited coverage on a mirror - try the next one
        if ((payload.elements || []).length === 0 && endpoint !== OVERPASS_ENDPOINTS[OVERPASS_ENDPOINTS.length - 1]) {
          lastError = 'No businesses with a published phone number were found in that area.';
          continue;
        }

        return payload;
      } catch (err) {
        lastError = err.name === 'AbortError' ? 'The map data service timed out.' : err.message;
      }
    }
  }

  throw new Error(lastError);
};

// Resolve a city name to a bounding box (Nominatim is free; 1 request/second policy)
const geocodeCache = new Map();

const geocodeCity = async (city) => {
  const key = city.toLowerCase();
  const cached = geocodeCache.get(key);
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.bbox;

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
  const response = await fetch(url, { headers: REQUEST_HEADERS });
  if (!response.ok) throw new Error(`Could not look up “${city}” right now.`);

  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error(`Could not find “${city}” on the map. Try a nearby larger city.`);
  }

  const [south, north, west, east] = results[0].boundingbox.map(Number);
  const bbox = { south, west, north, east, label: results[0].display_name };
  geocodeCache.set(key, { at: Date.now(), bbox });
  return bbox;
};

// Each category maps to OSM selectors that require a phone number
const LEAD_CATEGORIES = {
  offices: ['nwr["office"]["phone"]', 'nwr["office"]["contact:phone"]'],
  professional: [
    'nwr["office"~"^(lawyer|accountant|insurance|estate_agent|financial|it|company|consulting)$"]["phone"]',
    'nwr["office"~"^(lawyer|accountant|insurance|estate_agent|financial|it|company|consulting)$"]["contact:phone"]'
  ],
  retail: ['nwr["shop"]["phone"]', 'nwr["shop"]["contact:phone"]'],
  food: [
    'nwr["amenity"~"^(restaurant|cafe|bar|fast_food|bakery|pub)$"]["phone"]',
    'nwr["amenity"~"^(restaurant|cafe|bar|fast_food|bakery|pub)$"]["contact:phone"]'
  ],
  health: [
    'nwr["amenity"~"^(dentist|clinic|doctors|pharmacy|veterinary)$"]["phone"]',
    'nwr["amenity"~"^(dentist|clinic|doctors|pharmacy|veterinary)$"]["contact:phone"]'
  ],
  trades: [
    'nwr["craft"]["phone"]',
    'nwr["shop"~"^(car_repair|doityourself|hardware|electrical)$"]["phone"]',
    'nwr["shop"~"^(car_repair|doityourself|hardware|electrical)$"]["contact:phone"]'
  ]
};

const buildOverpassQuery = (bbox, category, limit) => {
  const selectors = LEAD_CATEGORIES[category] || LEAD_CATEGORIES.offices;
  // A bounding-box query is far cheaper than an administrative-area lookup
  const area = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `[out:json][timeout:20];
(
  ${selectors.map((selector) => `${selector}(${area});`).join('\n  ')}
);
out tags center ${limit};`;
};

const mapOverpassLead = (element, fallbackCity, country) => {
  const tags = element.tags || {};
  const rawPhone = tags.phone || tags['contact:phone'] || '';
  const name = tags.name || tags['operator'];

  if (!name || !rawPhone) return null;

  const website = tags.website || tags['contact:website'] || '';
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const city = tags['addr:city'] || fallbackCity;

  return {
    id: `osm-${element.type}-${element.id}`,
    // OSM has no contact person - the business itself is the contact
    name,
    company: name,
    phone: rawPhone.replace(/[^+\d]/g, ''),
    displayPhone: rawPhone,
    email: tags.email || tags['contact:email'] || '',
    website,
    address: [street, city].filter(Boolean).join(', '),
    country,
    region: city,
    size: 'Unknown',
    solution: '',
    status: 'New',
    value: 0,
    notes: `Real OpenStreetMap listing${website ? ' · website on file' : ' · no website listed'}`,
    createdAt: new Date().toISOString().split('T')[0],
    lat: element.lat ?? element.center?.lat ?? null,
    lon: element.lon ?? element.center?.lon ?? null
  };
};

// The lead search itself runs in the browser (src/lib/leads.js); /api/leads is the shared
// team list, registered further down.

/* ─────────────────────────  Transactional email (Gmail SMTP)  ───────────────────────── */

// Gmail SMTP: sends as the configured Gmail address using a Google app password
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const configuredSmtpPort = Number.parseInt(process.env.SMTP_PORT || '', 10);
const SMTP_PORT = Number.isInteger(configuredSmtpPort) && configuredSmtpPort > 0 ? configuredSmtpPort : 465;
// A relay behind SMTP_HOST authenticates with its own user and key, so those names win when set
const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER || '';
const smtpPass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const mailFrom = process.env.MAIL_FROM || (smtpUser ? `Concept IT Solutions <${smtpUser}>` : '');

// Gmail rewrites a From that is not the authenticated account, so the effective sender is
// resolved once and used by both the send and the delivery-log view.
const deliverability = require('./lib/mail-deliverability');
const SENDER = deliverability.resolveSender({
  smtpHost: SMTP_HOST,
  smtpUser,
  mailFrom,
  aliasVerified: process.env.GMAIL_FROM_ALIAS_VERIFIED
});

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

// Local auth endpoints share the same handlers the deployment uses
app.post('/api/auth/login', require('./api/auth/login'));
app.get('/api/auth/me', require('./api/auth/me'));
app.post('/api/auth/logout', require('./api/auth/logout'));
app.post('/api/auth/change-password', require('./api/auth/change-password'));
app.post('/api/auth/profile', require('./api/auth/profile'));

// Local staff-account management (admin only)
app.all('/api/admin/users', require('./api/admin/users'));

// API: Send an outreach email and record the delivery attempt
// API: the team's shared lead list. Everyone signed in reads the same list, and every status
// change is recorded against the employee who made it.
app.get('/api/leads', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = auth.requireActiveSession(req, res);
  if (!session) return;

  const leads = await leadsStore.listLeads();
  res.json({
    ok: true,
    count: leads.length,
    leads,
    deleted: await leadsStore.listDeleted(),
    storage: leadsStore.configured() ? 'persistent' : 'memory'
  });
});

// Deleting removes a lead for the whole team, so only an admin may do it
app.delete('/api/leads', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = auth.requireActiveSession(req, res);
  if (!session) return;

  if (!auth.isAdmin(session)) return res.status(403).json({ error: 'Only an admin can delete leads.' });

  const { leads } = req.body || {};
  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'Send the leads to delete as an array.' });
  }

  const remaining = await leadsStore.deleteLeads(leads);
  res.json({ ok: true, count: remaining.length, leads: remaining, deleted: await leadsStore.listDeleted() });
});

app.post('/api/leads', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = auth.requireActiveSession(req, res);
  if (!session) return;

  const { leads } = req.body || {};
  if (!Array.isArray(leads)) return res.status(400).json({ error: 'Send the leads as an array.' });

  const merged = await leadsStore.upsertLeads(leads, { name: session.name, email: session.email });
  res.json({ ok: true, count: merged.length, leads: merged, deleted: await leadsStore.listDeleted() });
});

// API: read a lead's contact address from the lead's own website. Browsers cannot fetch
// another site's HTML, so the lookup runs here and only the addresses come back.
app.post('/api/find-email', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = auth.requireActiveSession(req, res);
  if (!session) return;

  const { website } = req.body || {};
  if (!website) return res.status(400).json({ error: 'A website address is required.' });

  try {
    const result = await findEmails(website);
    if (result.error) return res.status(400).json(result);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(502).json({ error: 'That website could not be read.' });
  }
});

app.post('/api/emails', async (req, res) => {
  const session = auth.requireActiveSession(req, res);
  if (!session) return;

  const { to, subject, body, leadId, leadName, company, sentBy, requirements, test } = req.body || {};

  // A test goes only to the admin who asked for it, through the same transport and From as a real
  // outreach email, so a delivered test proves the path that outreach actually uses
  if (test) {
    if (!auth.isAdmin(session)) {
      return res.status(403).json({ error: 'Only an admin can send a deliverability test.' });
    }
    if (!transporter) {
      return res.status(503).json({
        error: `Email sending is not configured. Add GMAIL_APP_PASSWORD for ${smtpUser} to .env and restart the server.`
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
      const result = await testMail.sendTestEmail({ transporter, session, sender: SENDER });
      entry.subject = result.subject;
      entry.sentAt = result.sentAt;
      entry.status = 'sent';
      entry.providerId = result.messageId;
      writeEmailLog([entry, ...readEmailLog()]);
      logSender('email_test_sent', { to: entry.to, messageId: entry.providerId });
      return res.json({
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
      writeEmailLog([entry, ...readEmailLog()]);
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
  if (!transporter) {
    return res.status(503).json({
      error: `Email sending is not configured. Add GMAIL_APP_PASSWORD for ${smtpUser} to .env and restart the server.`
    });
  }

  const entry = {
    id: `em_${Date.now()}`,
    to: String(to).trim(),
    subject: deliverability.cleanSubject(subject),
    from: SENDER.from,
    fromMode: SENDER.mode,
    body,
    leadId: leadId ?? null,
    leadName: leadName || '',
    company: company || '',
    sentBy: session.name || sentBy || 'Unknown agent',
    sentAt: new Date().toISOString(),
    status: 'sending',
    providerId: null,
    error: null
  };

  // Email clients strip form controls, so the requirements form travels as a tokenised link
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

  entry.requirementsUrl = requirementsUrl;

  messageBody = deliverability.withFooter(messageBody);
  const replyTo = deliverability.replyTo(session.email, SENDER.address);

  try {
    const info = await transporter.sendMail({
      from: SENDER.from,
      to: entry.to,
      ...(replyTo ? { replyTo } : {}),
      subject: entry.subject,
      text: messageBody,
      // Lets the reply tracker attribute an answer to the agent who wrote it
      headers: {
        'X-Concept-Agent': entry.sentBy,
        'X-Concept-Lead': entry.leadName || entry.company || '',
        ...deliverability.unsubscribeHeaders(SENDER.address)
      }
    });

    entry.status = 'sent';
    entry.providerId = info.messageId || null;
    writeEmailLog([entry, ...readEmailLog()]);
    logSender('email_sent', { agent: entry.sentBy, lead: entry.leadName || entry.company || '' });

    // Lets the reply tracker attribute an answer to the agent who wrote it
    await sentStore.rememberSent({
      messageId: info.messageId,
      agent: entry.sentBy,
      agentEmail: session.email,
      leadName: entry.leadName || entry.company,
      to: entry.to,
      subject: entry.subject,
      sentAt: entry.sentAt
    });
    res.json({ ok: true, email: entry });
  } catch (err) {
    entry.status = 'failed';
    entry.error = err.message || 'Sending failed.';
    writeEmailLog([entry, ...readEmailLog()]);
    logSender('email_failed', { agent: entry.sentBy, error: entry.error });
    res.status(502).json({ error: entry.error, email: entry });
  }
});

// API: Delivery log (most recent first)
app.get('/api/emails', (req, res) => {
  const session = auth.requireActiveSession(req, res);
  if (!session) return;
  res.json({
    configured: Boolean(transporter),
    from: SENDER.from,
    fromMode: SENDER.mode,
    fromOverridden: SENDER.overridden,
    signature: deliverability.signatureFooter(),
    sender: smtpUser,
    emails: readEmailLog()
  });
});

// API: customer replies, attribution and admin reassignment (shared with the deployment)
app.all('/api/replies', require('./api/replies'));
app.all('/api/requirements', require('./api/requirements'));
app.all('/api/activity', require('./api/activity'));

// Fallback to SPA index.html. An unknown /api/ path is a missing endpoint, not a page, so it
// answers 404 instead of quietly serving the app's HTML.
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found.' });
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Ignore an empty or zero PORT so the API always lands on a reachable port
const configuredPort = Number.parseInt(process.env.PORT || '', 10);
const PORT = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 3000;
app.listen(PORT, () => {
  console.log(`Concept IT Solutions Server running on port ${PORT}`);
});
