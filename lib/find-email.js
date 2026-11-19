// Reads a business's contact address out of its own website. No API, no key, no cost:
// the page is fetched server-side (browsers cannot do this cross-origin) and scanned for
// published addresses. The same pass collects the social pages and WhatsApp link a business
// publishes, because a lead with none of those is a lead nobody can actually message.
// Only public http(s) hosts are fetched, bodies are capped, and every request carries a timeout.

const MAX_BYTES = 400_000;
const REQUEST_TIMEOUT = 7000;
// The contact page usually holds both the address and the social links, so it is read even
// when the homepage already published an email.
const CONTACT_PATHS = ['/contact', '/contact-us', '/about'];
const MAX_PAGES = 3;

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;
// Asset filenames share the shape of an address but are never contacts
const ASSET_EXTENSION = /\.(png|jpe?g|gif|webp|svg|avif|css|js|woff2?|ttf)$/i;
const PLACEHOLDER_DOMAINS = [
  'example.com',
  'domain.com',
  'email.com',
  'yourdomain.com',
  'sentry.io',
  'sentry-next.wixpress.com',
  'wixpress.com',
  'squarespace.com'
];

// Share buttons and tracking pixels live on the same hosts as real profiles, so they are skipped
const SOCIAL_PATTERNS = {
  facebook: /(?:https?:\/\/)?(?:www\.)?facebook\.com\/(?![^"' ]*(?:sharer|plugins|tr\?|\/tr|dialog|login))[A-Za-z0-9._%\-/]+/i,
  instagram: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?!p\/|reel\/|explore\/|accounts\/)[A-Za-z0-9._\-/]+/i,
  linkedin: /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:company|in|school)\/[A-Za-z0-9._%\-]+/i
};

// A site that publishes a wa.me link has already told us that number is on WhatsApp
const WHATSAPP_LINK = /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|web\.whatsapp\.com\/send\?phone=)(\+?\d{7,15})/i;

// Facebook and Instagram answer an automated request with a login wall or a 400 error, so they are
// reported as unreadable instead of being fetched as if they were an ordinary website
const SOCIAL_HOSTS = ['facebook.com', 'fb.com', 'instagram.com', 'linkedin.com', 'x.com', 'twitter.com'];

const isSocialHost = (hostname) => {
  const host = String(hostname || '').toLowerCase().replace(/^www\./, '');
  return SOCIAL_HOSTS.some((social) => host === social || host.endsWith(`.${social}`));
};

const isPublicHost = (hostname) => {
  const host = String(hostname || '').toLowerCase();
  if (!host.includes('.')) return false;
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  // An IP literal can point inside a private network, so it is not followed
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  if (host.includes(':') || host.startsWith('[')) return false;
  return true;
};

const normaliseUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch (err) {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !isPublicHost(url.hostname)) return null;
  url.hash = '';
  return url;
};

const fetchPage = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'ConceptITSolutions-lead-research/1.0 (+contact lookup for saved business leads)',
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    const type = response.headers.get('content-type') || '';
    if (!response.ok) return null;
    if (type && !/text\/html|text\/plain/i.test(type)) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.subarray(0, MAX_BYTES).toString('utf8');
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const siteDomain = (hostname) => String(hostname || '').toLowerCase().replace(/^www\./, '');

// Scores what a salesperson would reach for first: an address on the company's own domain,
// a generic inbox, and an address the page actually links with mailto:
const extractEmails = (html, hostname) => {
  const text = html.replace(/&#0*64;|&#x0*40;|%40/gi, '@');
  const site = siteDomain(hostname);
  const scored = new Map();

  for (const match of text.match(EMAIL_PATTERN) || []) {
    const email = match.toLowerCase().replace(/^[.]+|[.]+$/g, '');
    if (ASSET_EXTENSION.test(email)) continue;
    const [local, domain] = email.split('@');
    if (!local || !domain || domain.length > 60) continue;
    if (PLACEHOLDER_DOMAINS.some((placeholder) => domain === placeholder || domain.endsWith(`.${placeholder}`))) continue;

    const onOwnDomain = domain === site || domain.endsWith(`.${site}`) || site.endsWith(`.${domain}`);
    const genericInbox = /^(info|hello|contact|sales|enquiries|inquiries|office|admin|reception)$/.test(local);
    const linked = text.toLowerCase().includes(`mailto:${email}`);
    const score = (onOwnDomain ? 4 : 0) + (genericInbox ? 2 : 0) + (linked ? 1 : 0);

    if (!scored.has(email) || scored.get(email) < score) scored.set(email, score);
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
    .map(([email]) => email);
};

// Profile links are written as href="https://facebook.com/name" or bare text, and both point at
// the same page, so the match is trimmed to a clean absolute URL
const extractSocials = (html) => {
  const socials = {};
  for (const [network, pattern] of Object.entries(SOCIAL_PATTERNS)) {
    const match = String(html || '').match(pattern);
    if (!match) continue;
    const url = match[0]
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/["'<>\s].*$/, '')
      .replace(/[/.,;:]+$/, '');
    if (!url || url.split('/').length < 2) continue;
    socials[network] = `https://www.${url}`;
  }
  return socials;
};

const extractWhatsApp = (html) => {
  const match = String(html || '').match(WHATSAPP_LINK);
  return match ? match[1].replace(/\D/g, '') : '';
};

// Best addresses found on the site, most likely first. An empty list means the site simply
// does not publish one, which is common and is reported as such rather than guessed at.
async function findEmails(website) {
  const start = normaliseUrl(website);
  if (!start) {
    return { emails: [], socials: {}, whatsapp: '', checked: [], error: 'That website address is not a public http(s) URL.' };
  }

  if (isSocialHost(start.hostname)) {
    return {
      emails: [],
      socials: {},
      whatsapp: '',
      checked: [],
      error: 'Facebook and Instagram block automated reads — open that page yourself to see its contact details.'
    };
  }

  const checked = [];
  const socials = {};
  let whatsapp = '';
  let emails = [];

  const read = async (url) => {
    const html = await fetchPage(url);
    if (!html) return null;
    checked.push(url);
    Object.assign(socials, extractSocials(html));
    if (!whatsapp) whatsapp = extractWhatsApp(html);
    return html;
  };

  const home = await read(start.href);
  if (home) emails = extractEmails(home, start.hostname);

  // The homepage often only links to the contact page, and that page is also where the social
  // links and a WhatsApp number live even when the address is already on the homepage
  for (const path of CONTACT_PATHS) {
    if (checked.length >= MAX_PAGES) break;
    if (emails.length > 0 && Object.keys(socials).length >= 2) break;
    const pageUrl = new URL(path, start.origin).href;
    if (checked.includes(pageUrl)) continue;
    const page = await read(pageUrl);
    if (!page) continue;
    if (emails.length === 0) emails = extractEmails(page, start.hostname);
  }

  return { emails: emails.slice(0, 5), socials, whatsapp, checked };
}

module.exports = { findEmails };
