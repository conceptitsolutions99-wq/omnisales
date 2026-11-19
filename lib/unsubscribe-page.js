// The unsubscribe route itself. It answers without a session because the person clicking it
// only has an email: the signed token in the link is what proves which address is opting out.
// GET serves a small page for a click in a mail client; POST honours a one-click unsubscribe
// sent by a provider because of the List-Unsubscribe-Post header.
const suppression = require('./suppression-store');
const { readUnsubscribeToken } = require('./unsubscribe-token');

const escapeHtml = (value) =>
  String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const page = ({ title, heading, message, tone = 'ok' }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b1020; color: #e8ecf7; padding: 24px; }
  main { max-width: 520px; width: 100%; background: #151c33; border: 1px solid #26304d; border-radius: 18px; padding: 32px; }
  h1 { margin: 0 0 12px; font-size: 22px; }
  p { margin: 0 0 10px; color: #b9c3db; }
  .badge { display: inline-block; margin-bottom: 16px; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
  .ok { background: rgba(52,211,153,.15); color: #6ee7b7; }
  .err { background: rgba(248,113,113,.15); color: #fca5a5; }
  small { color: #7d89a8; }
</style>
</head>
<body>
<main>
  <span class="badge ${tone === 'ok' ? 'ok' : 'err'}">${tone === 'ok' ? 'Unsubscribed' : 'Link not valid'}</span>
  <h1>${escapeHtml(heading)}</h1>
  ${(Array.isArray(message) ? message : [message]).map((line) => `<p>${escapeHtml(line)}</p>`).join('\n  ')}
  <p><small>Concept IT Solutions</small></p>
</main>
</body>
</html>`;

const invalidPage = (res, status) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(
    page({
      title: 'Unsubscribe link not valid',
      heading: 'This unsubscribe link is not valid',
      message: [
        'The link may have been copied incompletely or produced by an older deployment.',
        'Reply to any message from us with the word "unsubscribe" and we will remove you by hand.'
      ],
      tone: 'error'
    })
  );
};

// Returns true when the request was an unsubscribe and has been answered
const handleUnsubscribe = async (req, res, token) => {
  const email = readUnsubscribeToken(token);

  if (req.method === 'POST' && !email) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'That unsubscribe token is not valid.' }));
    return true;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Use GET or POST.' }));
    return true;
  }

  if (!email) {
    invalidPage(res, 400);
    return true;
  }

  await suppression.suppress(email, {
    reason: 'unsubscribed',
    source: req.method === 'POST' ? 'one-click' : 'link',
    note: req.method === 'POST' ? 'Provider one-click unsubscribe' : 'Unsubscribe link clicked'
  });

  // A provider's one-click call expects a bare success, not a page
  if (req.method === 'POST') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, email, unsubscribed: true }));
    return true;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(
    page({
      title: 'You are unsubscribed',
      heading: `You are unsubscribed`,
      message: [
        `${email} will not receive any further outreach messages from Concept IT Solutions.`,
        'This applies to every member of the team, not just the person who wrote to you.'
      ],
      tone: 'ok'
    })
  );
  return true;
};

module.exports = { handleUnsubscribe, page };
