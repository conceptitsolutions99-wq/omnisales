// Reads customer replies from the shared Gmail inbox and attributes each one to the
// agent who sent the original message, using the X-Concept-Agent header stamped at send time.
const { ImapFlow } = require('imapflow');

const SENT_MAILBOXES = ['[Gmail]/Sent Mail', '[Gmail]/Sent', 'Sent'];

const normaliseId = (value = '') => String(value).replace(/[<>]/g, '').trim();

// IMAP headers arrive as one raw block, so unfold continuations before reading a field
const readHeader = (raw, name) => {
  if (!raw) return '';
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  const pattern = new RegExp(`^${name}:\\s*([\\s\\S]*?)(?=\\r?\\n[^\\s]|$)`, 'im');
  const match = text.match(pattern);
  return match ? match[1].replace(/\r?\n\s+/g, ' ').trim() : '';
};

const fetchReplies = async ({ user, pass, inboxWindow = 120, sentWindow = 80, limit = 40, budgetMs = 8000 } = {}) => {
  const startedAt = Date.now();
  const expired = () => Date.now() - startedAt > budgetMs;

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false
  });

  await client.connect();

  try {
    // 1. Index recent sent mail: Message-ID -> who sent it and for which lead
    const sentIndex = new Map();
    const mailboxList = await client.list();
    const sentPath = SENT_MAILBOXES.find((candidate) => mailboxList.some((box) => box.path === candidate));

    if (sentPath && !expired()) {
      const lock = await client.getMailboxLock(sentPath);
      try {
        const total = client.mailbox.exists;
        if (total > 0) {
          const range = `${Math.max(1, total - sentWindow + 1)}:*`;
          for await (const message of client.fetch(range, { envelope: true, headers: true })) {
            if (expired()) break;
            const id = normaliseId(readHeader(message.headers, 'Message-ID'));
            if (!id) continue;
            sentIndex.set(id, {
              agent: readHeader(message.headers, 'X-Concept-Agent'),
              leadName: readHeader(message.headers, 'X-Concept-Lead'),
              subject: message.envelope?.subject || '',
              sentAt: message.envelope?.date ? new Date(message.envelope.date).toISOString() : null,
              to: message.envelope?.to?.[0]?.address || ''
            });
          }
        }
      } finally {
        lock.release();
      }
    }

    // 2. Read the inbox and match each reply back to the message it answers
    const replies = [];
    const inboxLock = await client.getMailboxLock('INBOX');
    try {
      const total = client.mailbox.exists;
      if (total > 0) {
        const range = `${Math.max(1, total - inboxWindow + 1)}:*`;
        for await (const message of client.fetch(range, { envelope: true, headers: true, internalDate: true })) {
          if (expired()) break;

          const inReplyTo = normaliseId(readHeader(message.headers, 'In-Reply-To'));
          const references = readHeader(message.headers, 'References')
            .split(/\s+/)
            .map(normaliseId)
            .filter(Boolean);

          if (!inReplyTo && references.length === 0) continue;

          const from = message.envelope?.from?.[0] || {};
          if (!from.address) continue;
          if (from.address.toLowerCase() === String(user).toLowerCase()) continue; // our own copy

          const matchId = [inReplyTo, ...references.slice().reverse()].find((id) => id && sentIndex.has(id));
          const original = matchId ? sentIndex.get(matchId) : null;

          replies.push({
            id: normaliseId(readHeader(message.headers, 'Message-ID')) || `${from.address}:${message.uid}`,
            from: from.address,
            fromName: from.name || from.address,
            subject: message.envelope?.subject || '',
            receivedAt: message.internalDate ? new Date(message.internalDate).toISOString() : null,
            agent: original?.agent || null,
            leadName: original?.leadName || '',
            originalSubject: original?.subject || '',
            matched: Boolean(original)
          });
        }
      }
    } finally {
      inboxLock.release();
    }

    return replies
      .sort((a, b) => String(b.receivedAt || '').localeCompare(String(a.receivedAt || '')))
      .slice(0, limit);
  } finally {
    await client.logout().catch(() => {});
  }
};

module.exports = { fetchReplies };
