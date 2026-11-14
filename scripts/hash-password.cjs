// Builds the server-side account list for APP_USERS.
//
//   node scripts/hash-password.cjs you@company.com "your password"
//
// Nothing is written to disk; copy the printed JSON into the APP_USERS variable.
const crypto = require('crypto');

const [email, password, name = 'Administrator', role = 'Admin'] = process.argv.slice(2);

if (!email || !password) {
  console.error('Usage: node scripts/hash-password.cjs <email> <password> [name] [role]');
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(password, salt, 64).toString('hex');

const user = {
  id: 1,
  name,
  email,
  role,
  status: 'Active',
  permissions: {
    leads: true,
    dialler: true,
    analytics: role === 'Admin',
    followups: true,
    admin: role === 'Admin'
  },
  passwordHash: `scrypt:${salt}:${hash}`
};

console.log(JSON.stringify([user], null, 2));
