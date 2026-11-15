// Vercel serverless function: finds a lead's contact email on the lead's own website.
// The page is read here rather than in the browser, which the site's own CORS rules block.
const auth = require('../lib/auth-core');
const { findEmails } = require('../lib/find-email');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const session = auth.requireActiveSession(req, res);
  if (!session) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }

  const { website } = req.body || {};
  if (!website) {
    return res.status(400).json({ error: 'A website address is required.' });
  }

  try {
    const result = await findEmails(website);
    if (result.error) return res.status(400).json(result);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(502).json({ error: 'That website could not be read.' });
  }
};
