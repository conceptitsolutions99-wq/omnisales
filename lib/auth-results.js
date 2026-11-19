// A send that succeeds only proves SMTP accepted the message. Gmail stamps Authentication-Results
// on what it delivers, so reading that header back over the same IMAP account proves the From
// actually used was authenticated and aligned — which is what keeps outreach out of spam.
const { ImapFlow } = require('imapflow');

const normaliseId = (value = '') => String(value).replace(/[<>]/g, '').trim();

const headerText = (raw) => (raw ? (Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw)) : '');

// IMAP headers arrive as one raw block, so unfold continuations before reading a field
const readHeader = (raw, name) => {
  const text = headerText(raw);
  const pattern = new RegExp(`^${name}:\\s*([\\s\\S]*?)(?=\\r?\\n[^\\s]|$)`, 'im');
  const match = text.match(pattern);
  return match ? match[1].replace(/\r?\n\s+/g, ' ').trim() : '';
};

const domainOf = (value) =>
  String(value || '')
    .toLowerCase()
    .split('@')
    .pop()
    .replace(/[>;,]/g, '')
    .trim();

// "dkim=pass header.d=gmail.com" and friends; the dmarc clause can itself mention p=REJECT
const parseAuthenticationResults = (raw) => {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  // A message can carry several signatures; one pass is enough for the receiver to trust it
  const verdict = (mechanism) => {
    const pattern = new RegExp(`(?:^|[;\\s])${mechanism}\\s*=\\s*([a-z]+)`, 'gi');
    const matches = [...text.matchAll(pattern)].map((match) => match[1].toLowerCase());
    if (matches.length === 0) return '';
    return matches.includes('pass') ? 'pass' : matches[0];
  };

  const headerFrom = (text.match(/header\.from\s*=\s*([^\s;)]+)/i) || [])[1] || '';
  const dkimDomain = (text.match(/header\.[di]\s*=\s*@?([^\s;)]+)/i) || [])[1] || '';
  const spfDomain = (text.match(/(?:smtp\.mailfrom|envelope-from)\s*=\s*([^\s;)]+)/i) || [])[1] || '';

  const verdicts = { spf: verdict('spf'), dkim: verdict('dkim'), dmarc: verdict('dmarc') };

  return {
    ...verdicts,
    headerFrom,
    dkimDomain,
    spfDomain,
    // DMARC passes only when an authenticated domain lines up with the visible From domain,
    // which is the alignment question a bare SPF or DKIM pass does not answer
    aligned: verdicts.dmarc === 'pass',
    fromDomain: domainOf(headerFrom) || domainOf(dkimDomain),
    raw: text
  };
};

// Polls the inbox for the test we just sent, matched by the X-Concept-Test header and its
// Message-ID, then reports the verdicts Gmail recorded for it
const findDeliveredTest = async ({ user, pass, messageId, budgetMs = 4000 } = {}) => {
  if (!user || !pass) return { found: false, reason: 'imap_not_configured' };

  const startedAt = Date.now();
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false
  });

  await client.connect();

  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      while (Date.now() - startedAt < budgetMs) {
        const uids = await client.search({ header: { 'x-concept-test': 'deliverability' } }, { uid: true });
        const candidates = (uids || []).slice(-6).reverse();

        for (const uid of candidates) {
          const message = await client.fetchOne(uid, { headers: true }, { uid: true });
          const headers = message && message.headers;
          if (!headers) continue;

          const id = normaliseId(readHeader(headers, 'Message-ID'));
          if (messageId && id && id !== normaliseId(messageId)) continue;

          const parsed = parseAuthenticationResults(readHeader(headers, 'Authentication-Results'));
          if (!parsed) continue;

          return {
            found: true,
            ...parsed,
            receivedSpf: readHeader(headers, 'Received-SPF'),
            readAt: new Date().toISOString()
          };
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      // Gmail had not delivered it into the inbox before the time budget ran out
      return { found: false, reason: 'not_delivered_yet' };
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      /* the connection may already be closed by the timeout, which is fine */
    }
  }
};

module.exports = { parseAuthenticationResults, findDeliveredTest };
