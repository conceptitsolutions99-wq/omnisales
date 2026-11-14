// Vercel serverless function: customer replies to outreach email.
//
// Attribution order: the admin's manual assignment, the X-Concept-Agent header stamped at
// send time, then the server-side index of everything the app sent (by Message-ID, then by
// recipient). The index matters because the IMAP sent-folder scan is time-boxed: when it
// comes back empty every reply used to look unassigned with no way to fix it.
//
// Every call writes one JSON line to the platform log with a request id, so a failing request
// can be traced without guessing. The same id is returned in the body and the X-Request-Id
// header, which is what a "Failed to fetch" from the browser has to be matched against.
const crypto = require('crypto');
const { fetchReplies } = require('../lib/replies-core');
const auth = require('../lib/auth-core');
const sentStore = require('../lib/replies-store');

const smtpUser = process.env.GMAIL_USER || '';
const smtpPass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');

const normaliseId = (value = '') => String(value).replace(/[<>]/g, '').trim().toLowerCase();
const normaliseEmail = (value = '') => String(value).trim().toLowerCase();

const newRequestId = () => crypto.randomUUID().slice(0, 8);

const log = (level, requestId, event, fields = {}) => {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    level,
    route: 'api/replies',
    requestId,
    event,
    ...fields
  });
  if (level === 'error') console.error(line);
  else console.log(line);
};

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

const handler = async (req, res) => {
  const requestId = newRequestId();
  const startedAt = Date.now();
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Request-Id', requestId);

  const method = req.method;
  const clientIp = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  const done = (status, event, fields = {}) => {
    log(status >= 500 ? 'error' : 'info', requestId, event, {
      method,
      status,
      ms: Date.now() - startedAt,
      ...fields
    });
  };

  const session = auth.requireActiveSession(req, res);
  if (!session) {
    done(401, 'not_signed_in', { ip: clientIp });
    return;
  }

  const who = { user: session.email || 'unknown', role: session.role || '', ip: clientIp };

  // Admins hand a reply to any employee; an empty email puts it back on automatic
  if (method === 'POST') {
    if (!auth.isAdmin(session)) {
      done(403, 'assign_forbidden', who);
      return res.status(403).json({ error: 'Only an administrator can assign replies.' });
    }

    const { id, email } = req.body || {};
    const replyId = String(id || '').trim();
    if (!replyId) {
      done(400, 'assign_missing_id', who);
      return res.status(400).json({ error: 'A reply id is required.' });
    }

    const target = normaliseEmail(email);
    if (!target) {
      await sentStore.setAssignment(replyId, null);
      done(200, 'assign_cleared', { ...who, replyId });
      return res.status(200).json({ ok: true, assignment: null });
    }

    const account = await auth.resolveAccount(target);
    if (!account) {
      done(400, 'assign_unknown_account', { ...who, target });
      return res.status(400).json({ error: 'No employee account uses that email.' });
    }
    if (account.status === 'Suspended') {
      done(400, 'assign_suspended_account', { ...who, target });
      return res.status(400).json({ error: 'That account is suspended.' });
    }

    const assignment = {
      name: account.name,
      email: account.email,
      by: session.email,
      assignedAt: new Date().toISOString()
    };
    await sentStore.setAssignment(replyId, assignment);
    done(200, 'assign_saved', { ...who, replyId, target });
    return res.status(200).json({ ok: true, assignment });
  }

  if (method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    done(405, 'method_not_allowed', who);
    return res.status(405).json({ error: 'Use GET or POST.' });
  }

  if (!smtpUser || !smtpPass) {
    done(503, 'gmail_not_configured', { ...who, hasUser: Boolean(smtpUser), hasPass: Boolean(smtpPass) });
    return res.status(503).json({
      error: 'Reply tracking is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to the environment variables, then redeploy.'
    });
  }

  const mailStarted = Date.now();
  let mailMs = null;
  let storeMs = null;

  try {
    const storeStarted = Date.now();
    const [replies, sentIndex, assignments] = await Promise.all([
      fetchReplies({ user: smtpUser, pass: smtpPass }).then((result) => {
        mailMs = Date.now() - mailStarted;
        return result;
      }),
      sentStore.listSent().then((rows) => {
        storeMs = Date.now() - storeStarted;
        return rows;
      }),
      sentStore.listAssignments()
    ]);
    if (storeMs === null) storeMs = Date.now() - storeStarted;

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

    done(200, 'replies_loaded', {
      ...who,
      replies: resolved.length,
      visible: visible.length,
      unassigned: visible.filter((reply) => !reply.agent).length,
      mailMs,
      storeMs,
      storage: sentStore.configured() ? 'persistent' : 'memory'
    });

    return res.status(200).json({
      ok: true,
      count: visible.length,
      replies: visible,
      storage: sentStore.configured() ? 'persistent' : 'memory',
      requestId
    });
  } catch (err) {
    log('error', requestId, 'replies_failed', {
      ...who,
      ms: Date.now() - startedAt,
      mailMs,
      storeMs,
      name: err?.name,
      code: err?.code,
      message: err?.message,
      stack: String(err?.stack || '').split('\n').slice(0, 6).join(' | ')
    });
    return res.status(502).json({ error: `Could not read the mailbox: ${err.message}`, requestId });
  }
};

module.exports = async (req, res) => {
  try {
    return await handler(req, res);
  } catch (err) {
    // Anything thrown outside the mail try block still has to leave a trace
    log('error', newRequestId(), 'unhandled', {
      method: req.method,
      name: err?.name,
      code: err?.code,
      message: err?.message,
      stack: String(err?.stack || '').split('\n').slice(0, 6).join(' | ')
    });
    if (!res.headersSent) return res.status(500).json({ error: 'The replies service failed unexpectedly.' });
    return undefined;
  }
};
