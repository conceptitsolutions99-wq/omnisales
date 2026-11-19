// A deliverability test is a real send: it uses the same transport, From and headers as outreach,
// but it only ever goes to the admin who asked for it. The reply reports the address, mode and
// provider message id that the delivery actually used, instead of assuming them.
const deliverability = require('./mail-deliverability');

const TEST_SUBJECT = 'Deliverability test — Concept IT Solutions';

const testBody = (session, sentAt) =>
  [
    'This is a deliverability test from the Concept IT Solutions outbound system.',
    '',
    `Requested by: ${session.name || session.email || 'Admin'}`,
    `Requested at: ${sentAt}`,
    '',
    'If this message reached your inbox, the configured mail path is delivering. Check the',
    'Sender column in the delivery log to see the address and mode this test actually used.'
  ].join('\n');

// Sends through the caller's transporter so the test exercises the same credentials, TLS mode
// and timeout as a real outreach email
const sendTestEmail = async ({ transporter, session, sender, unsubscribeUrl = '' }) => {
  const sentAt = new Date().toISOString();
  const subject = deliverability.cleanSubject(TEST_SUBJECT);
  const text = deliverability.withFooter(testBody(session, sentAt), { unsubscribeUrl });
  const headers = deliverability.unsubscribeHeaders(sender.address, unsubscribeUrl);

  const info = await transporter.sendMail({
    from: sender.from,
    to: session.email,
    subject,
    text,
    headers: { 'X-Concept-Test': 'deliverability', ...headers }
  });

  return {
    subject,
    sentAt,
    messageId: info.messageId || null,
    accepted: info.accepted || [],
    rejected: info.rejected || []
  };
};

module.exports = { sendTestEmail, TEST_SUBJECT };
