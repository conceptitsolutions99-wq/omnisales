// Reads customer replies from the shared Gmail inbox and attributes each one to the
// agent who sent the original message, using the X-Concept-Agent header stamped at send time.
const { ImapFlow } = require('imapflow');
const suppression = require('./suppression-store');

const SENT_MAILBOXES = ['[Gmail]/Sent Mail', '[Gmail]/Sent', 'Sent'];

const normaliseId = (value = '') => String(value).replace(/[<>]/g, '').trim();

const mailAddress = (value = '') => {
  const match = String(value).match(/<([^<>\s]+@[^<>\s]+)>/);
  return (match ? match[1] : String(value)).trim().toLowerCase();
};

// Every address this app sends from. A note it mails itself lands in the same inbox it scans,
// and with a relay or a "send as" alias its From is not the IMAP login, so the login alone is
// not enough to recognise it.
const ownAddresses = (imapUser = '') =>
  [...new Set([imapUser, process.env.GMAIL_USER, process.env.SMTP_USER, process.env.MAIL_FROM]
    .map(mailAddress)
    .filter((address) => address.includes('@')))];

// Mail the app sends itself is never a customer answer: counted as one it would mark the lead
// Replied and pause outreach to a prospect who told us nothing.
const isAppOwnMail = ({ fromAddress, subject, headers, own = [] } = {}) => {
  const from = mailAddress(fromAddress);
  if (from && own.some((address) => address === from)) return true;
  if (readHeader(headers, 'X-Concept-Notice')) return true;
  // The prefix also covers notes sent before the header existed
  return /^requirements answered\b/i.test(String(subject || '').trim());
};

// A delivery report is not a customer. Hard failures are what belong on the do-not-contact list,
// and the opt-out reply the signature invites (its mailto link uses the subject "unsubscribe")
// is honoured automatically instead of waiting in the shared inbox.
const BOUNCE_FROM = /^(mailer-daemon|mail-daemon|postmaster)@/i;
const BOUNCE_SUBJECT = /(undelivered mail|delivery status notification|mail delivery failed|delivery failure|returned mail|failure notice|undeliverable)/i;
const UNSUBSCRIBE_SUBJECT = /^\s*unsubscribe\s*$/i;

const isBounceCandidate = (subject, fromAddress, contentType) =>
  BOUNCE_FROM.test(String(fromAddress || '')) ||
  BOUNCE_SUBJECT.test(String(subject || '')) ||
  /multipart\/report/i.test(String(contentType || ''));

// The failed address and the verdict live in the message/delivery-status part of a DSN
const parseDeliveryStatus = (text) => {
  const raw = String(text || '');
  const status = (raw.match(/^Status:\s*([245]\.\d{1,3}\.\d{1,3})/im) || [])[1] || '';
  const action = (raw.match(/^Action:\s*(\w+)/im) || [])[1] || '';
  const recipient =
    (raw.match(/^Final-Recipient:\s*(?:rfc822|utf-8);\s*<?([^\s<>;]+@[^\s<>;]+)/im) || [])[1] ||
    (raw.match(/^Original-Recipient:\s*(?:rfc822|utf-8);\s*<?([^\s<>;]+@[^\s<>;]+)/im) || [])[1] ||
    '';
  return {
    status: status.toLowerCase(),
    action: action.toLowerCase(),
    recipient: recipient.trim().toLowerCase()
  };
};

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

  const own = ownAddresses(user);

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
    const bounceUids = [];
    const inboxLock = await client.getMailboxLock('INBOX');
    try {
      const total = client.mailbox.exists;
      if (total > 0) {
        const range = `${Math.max(1, total - inboxWindow + 1)}:*`;
        for await (const message of client.fetch(range, { envelope: true, headers: true, internalDate: true })) {
          if (expired()) break;

          const from = message.envelope?.from?.[0] || {};
          if (!from.address) continue;

          const subject = message.envelope?.subject || '';

          // Our own copy of an outreach message, and the app's own notices (a requirements
          // submission, for example), are skipped before anything acts on them
          if (isAppOwnMail({ fromAddress: from.address, subject, headers: message.headers, own })) continue;

          // The signature's mailto opt-out opens a message with this subject
          if (UNSUBSCRIBE_SUBJECT.test(subject)) {
            await suppression.suppress(from.address, {
              reason: 'unsubscribed',
              source: 'email reply',
              note: subject
            });
            continue;
          }

          if (isBounceCandidate(subject, from.address, readHeader(message.headers, 'Content-Type'))) {
            if (message.uid) bounceUids.push(message.uid);
            continue;
          }

          const inReplyTo = normaliseId(readHeader(message.headers, 'In-Reply-To'));
          const references = readHeader(message.headers, 'References')
            .split(/\s+/)
            .map(normaliseId)
            .filter(Boolean);

          if (!inReplyTo && references.length === 0) continue;

          const matchId = [inReplyTo, ...references.slice().reverse()].find((id) => id && sentIndex.has(id));
          const original = matchId ? sentIndex.get(matchId) : null;

          replies.push({
            id: normaliseId(readHeader(message.headers, 'Message-ID')) || `${from.address}:${message.uid}`,
            from: from.address,
            fromName: from.name || from.address,
            subject: message.envelope?.subject || '',
            receivedAt: message.internalDate ? new Date(message.internalDate).toISOString() : null,
            messageIds: [inReplyTo, ...references].filter(Boolean),
            agent: original?.agent || null,
            leadName: original?.leadName || '',
            originalSubject: original?.subject || '',
            matched: Boolean(original)
          });
        }
      }
      // Only the few delivery reports are read in full, because the failed address is in the body
      for (const uid of bounceUids.slice(0, 20)) {
        if (expired()) break;
        try {
          const full = await client.fetchOne(uid, { source: true }, { uid: true });
          const raw = full && full.source ? Buffer.from(full.source).toString('utf8') : '';
          const { status, action, recipient } = parseDeliveryStatus(raw);
          if (!recipient) continue;
          const permanent = action === 'failed' && /^5\./.test(status);
          if (!permanent) continue;
          await suppression.suppress(recipient, {
            reason: 'hard_bounce',
            source: 'bounce',
            note: `Status ${status}`
          });
        } catch (err) {
          // An unreadable report must not stop the replies that were read successfully
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

module.exports = { fetchReplies, isBounceCandidate, parseDeliveryStatus, isAppOwnMail, ownAddresses, mailAddress };
