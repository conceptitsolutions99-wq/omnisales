const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

process.env.SIGNIN_NOTIFY_ENABLED = 'true';
process.env.SIGNIN_NOTIFY_EMAIL = 'boss@example.com';
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_USER = 'qa@example.com';
process.env.SMTP_PASS = 'testpass';
process.env.MAIL_FROM = 'Concept IT Solutions <qa@example.com>';

test('a silent SMTP server cannot hold up a sign-in note for more than the cap', async () => {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.write('220 silent ESMTP\r\n');
    // Read and ignore everything after the greeting: no EHLO reply, no auth, no DATA
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.SMTP_PORT = String(server.address().port);

  try {
    const notify = require('../lib/signin-notify');
    const started = Date.now();
    const result = await notify.notifySignIn({
      account: { name: 'Sam Rivera', email: 'sam@example.com', role: 'Sales Agent' },
      req: { headers: {}, socket: { remoteAddress: '127.0.0.1' } }
    });
    const elapsed = Date.now() - started;

    assert.equal(result.sent, false);
    assert.ok(elapsed < 4000, `sign-in waited ${elapsed}ms, expected the 3s cap`);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
});
