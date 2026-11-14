// Vercel serverless function: customer replies to outreach email.
const { fetchReplies } = require('../lib/replies-core');

const smtpUser = process.env.GMAIL_USER || '';
const smtpPass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Use GET.' });
  }

  if (!smtpUser || !smtpPass) {
    return res.status(503).json({
      error: 'Reply tracking is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to the environment variables, then redeploy.'
    });
  }

  const agent = String(req.query.agent || '').trim();
  const seesEverything = req.query.all === '1';

  try {
    const replies = await fetchReplies({ user: smtpUser, pass: smtpPass });

    // Agents only receive their own replies; the admin asks for everything
    const visible = seesEverything || !agent
      ? replies
      : replies.filter((reply) => reply.agent && reply.agent.toLowerCase() === agent.toLowerCase());

    return res.status(200).json({ ok: true, count: visible.length, replies: visible });
  } catch (err) {
    return res.status(502).json({ error: `Could not read the mailbox: ${err.message}` });
  }
};
