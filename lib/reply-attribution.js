// Who a reply belongs to and whether it answers our outreach are two different questions.
// Attribution is a best guess (a manual assignment, the agent header, or the most recent
// message to that address), while `matched` is evidence: the reply's In-Reply-To/References
// points at a Message-ID the app recorded sending. A prospect who writes a fresh,
// unrelated thread, or an admin who assigns an inbox message to an agent, must not turn a
// lead into "Replied" or pause outreach to it.

const normaliseId = (value = '') => String(value).replace(/[<>]/g, '').trim().toLowerCase();
const normaliseEmail = (value = '') => String(value).trim().toLowerCase();

const resolveReply = (reply, sentIndex = [], assignments = {}) => {
  const ids = (reply.messageIds || []).map(normaliseId).filter(Boolean);
  const byMessageId = ids.length
    ? sentIndex.find((row) => row.messageId && ids.includes(normaliseId(row.messageId)))
    : null;
  const byRecipient = sentIndex.find((row) => row.to && normaliseEmail(row.to) === normaliseEmail(reply.from));
  const original = byMessageId || byRecipient;

  // The IMAP sent-folder scan sets `matched` itself; the app's own index proves it by Message-ID.
  // A recipient-only match attributes the reply but does not prove the thread is ours.
  const matched = Boolean(reply.matched || byMessageId);

  const override = assignments[reply.id];
  if (override) {
    return {
      agent: override.name || null,
      agentEmail: normaliseEmail(override.email) || null,
      leadName: override.leadName || reply.leadName || '',
      manual: true,
      assignedBy: override.by || null,
      matched
    };
  }

  if (reply.agent) {
    return {
      agent: reply.agent,
      agentEmail: normaliseEmail(reply.agentEmail) || null,
      leadName: reply.leadName || '',
      manual: false,
      matched
    };
  }

  return {
    agent: original?.agent || null,
    agentEmail: normaliseEmail(original?.agentEmail) || null,
    leadName: reply.leadName || original?.leadName || '',
    manual: false,
    matched
  };
};

module.exports = { resolveReply, normaliseId, normaliseEmail };
