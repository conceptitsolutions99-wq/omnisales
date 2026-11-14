// Vercel serverless function: customer replies to outreach email.
//
// Attribution order: the admin's manual assignment, the X-Concept-Agent header stamped at
// send time, then the server-side index of everything the app sent (by Message-ID, then by
// recipient). The index matters because the IMAP sent-folder scan is time-boxed: when it
// comes back empty every reply used to look unassigned with no way to fix it.
const { fetchReplies } = require('../lib/replies-core');
const auth = require('../lib/auth-core');
const sentStore = require('../lib/replies-store');

const smtpUser = process.env.GMAIL_USER || '';
const smtpPass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');

const normaliseId = (value = '') => String(value).replace(/[<>]/g, '').trim().toLowerCase();
const normaliseEmail = (value = '') => String(value).trim().toLowerCase();

const resolveReply = (reply, sentIndex, assignments) => {
  const override = assignments[reply.id];
  if (override) {
    return {
      agent: override.name || null,
      agentEmail: normaliseEmail(override.email) || null,
      leadName: override.leadName || reply.leadName || '',
      manual: true,
      assignedBy: override.by || null
    };
  }

  if (reply.agent) {
    return { agent: reply.agent, agentEmail: reply.agentEmail || null, leadName: reply.leadName || '', manual: false };
  }

  const ids = (reply.messageIds || []).map(normaliseId).filter(Boolean);
  const byMessageId = ids.length
    ? sentIndex.find((row) => row.messageId && ids.includes(normaliseId(row.messageId)))
    : null;
  const original = byMessageId || sentIndex.find((row) => row.to && normaliseEmail(row.to) === normaliseEmail(reply.from));

  return {
    agent: original?.agent || null,
    agentEmail: normaliseEmail(original?.agentEmail) || null,
    leadName: reply.leadName || original?.leadName || '',
    manual: false
  };
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const session = auth.requireActiveSession(req, res);
  if (!session) return;

  // Admins hand a reply to any employee; an empty email puts it back on automatic
  if (req.method === 'POST') {
    if (!auth.isAdmin(session)) {
      return res.status(403).json({ error: 'Only an administrator can assign replies.' });
    }

    const { id, email } = req.body || {};
    const replyId = String(id || '').trim();
    if (!replyId) return res.status(400).json({ error: 'A reply id is required.' });

    const target = normaliseEmail(email);
    if (!target) {
      await sentStore.setAssignment(replyId, null);
      return res.status(200).json({ ok: true, assignment: null });
    }

    const account = await auth.resolveAccount(target);
    if (!account) return res.status(400).json({ error: 'No employee account uses that email.' });
    if (account.status === 'Suspended') return res.status(400).json({ error: 'That account is suspended.' });

    const assignment = {
      name: account.name,
      email: account.email,
      by: session.email,
      assignedAt: new Date().toISOString()
    };
    await sentStore.setAssignment(replyId, assignment);
    return res.status(200).json({ ok: true, assignment });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST.' });
  }

  if (!smtpUser || !smtpPass) {
    return res.status(503).json({
      error: 'Reply tracking is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to the environment variables, then redeploy.'
    });
  }

  try {
    const [replies, sentIndex, assignments] = await Promise.all([
      fetchReplies({ user: smtpUser, pass: smtpPass }),
      sentStore.listSent(),
      sentStore.listAssignments()
    ]);

    const resolved = replies.map((reply) => {
      const attribution = resolveReply(reply, sentIndex, assignments);
      return { ...reply, ...attribution, matched: Boolean(reply.matched || attribution.agent) };
    });

    // The session decides what is visible - never the query string
    const visible = auth.isAdmin(session)
      ? resolved
      : resolved.filter((reply) => {
          if (!reply.agent) return false;
          if (reply.agentEmail) return reply.agentEmail === normaliseEmail(session.email);
          return reply.agent.toLowerCase() === String(session.name || '').toLowerCase();
        });

    return res.status(200).json({
      ok: true,
      count: visible.length,
      replies: visible,
      storage: sentStore.configured() ? 'persistent' : 'memory'
    });
  } catch (err) {
    return res.status(502).json({ error: `Could not read the mailbox: ${err.message}` });
  }
};
