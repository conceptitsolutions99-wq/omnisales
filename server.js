require('dotenv').config();
// Prefer IPv4: some public APIs (Overpass) hang on IPv6 from Node's fetch
require('node:dns').setDefaultResultOrder('ipv4first');
const express = require('express');
const fs = require('fs');
const path = require('path');
const twilio = require('twilio');
const nodemailer = require('nodemailer');
const auth = require('./lib/auth-core');
const sentStore = require('./lib/replies-store');
const requirementsStore = require('./lib/requirements-store');

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
    twiml.say('Thanks for calling Concept IT Solutions. Connecting your outbound call.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

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

// API: Search real local businesses that publish a phone number
app.get('/api/leads', async (req, res) => {
  const city = String(req.query.city || '').trim();
  const category = String(req.query.category || 'offices').toLowerCase();
  const country = String(req.query.country || '').trim();
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 25;

  if (city.length < 2) {
    return res.status(400).json({ error: 'Enter a city or region to search.' });
  }

  try {
    const bbox = await geocodeCity(city);
    const payload = await queryOverpass(buildOverpassQuery(bbox, category, limit));
    const elements = Array.isArray(payload.elements) ? payload.elements : [];
    const leads = elements
      .map((element) => mapOverpassLead(element, city, country))
      .filter(Boolean);

    res.json({
      ok: true,
      count: leads.length,
      source: 'OpenStreetMap',
      location: bbox.label,
      attribution: '© OpenStreetMap contributors',
      leads
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ─────────────────────────  Transactional email (Gmail SMTP)  ───────────────────────── */

// Gmail SMTP: sends as the configured Gmail address using a Google app password
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const configuredSmtpPort = Number.parseInt(process.env.SMTP_PORT || '', 10);
const SMTP_PORT = Number.isInteger(configuredSmtpPort) && configuredSmtpPort > 0 ? configuredSmtpPort : 465;
const smtpUser = process.env.GMAIL_USER || '';
const smtpPass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const mailFrom = process.env.MAIL_FROM || (smtpUser ? `Concept IT Solutions <${smtpUser}>` : '');

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

// Local staff-account management (admin only)
app.all('/api/admin/users', require('./api/admin/users'));

// API: Send an outreach email and record the delivery attempt
app.post('/api/emails', async (req, res) => {
  const session = auth.requireActiveSession(req, res);
  if (!session) return;

  const { to, subject, body, leadId, leadName, company, sentBy, requirements } = req.body || {};

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
    writeEmailLog([entry, ...readEmailLog()]);

    // Lets the reply tracker attribute an answer to the agent who wrote it
    await sentStore.rememberSent({
      messageId: info.messageId,
      agent: entry.sentBy,
      agentEmail: session.email,
      leadName: entry.leadName || entry.company,
      to: entry.to,
      subject,
      sentAt: entry.sentAt
    });
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
  const session = auth.requireActiveSession(req, res);
  if (!session) return;
  res.json({ configured: Boolean(transporter), from: mailFrom, sender: smtpUser, emails: readEmailLog() });
});

// API: customer replies, attribution and admin reassignment (shared with the deployment)
app.all('/api/replies', require('./api/replies'));
app.all('/api/requirements', require('./api/requirements'));

// Fallback to SPA index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Ignore an empty or zero PORT so the API always lands on a reachable port
const configuredPort = Number.parseInt(process.env.PORT || '', 10);
const PORT = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 3000;
app.listen(PORT, () => {
  console.log(`Concept IT Solutions Server running on port ${PORT}`);
});
