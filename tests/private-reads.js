// In one process the in-memory store hands every caller the same object, so two writers mutate one
// copy and a lost update stays hidden. Two serverless instances each hold their own copy of the
// JSON, so a read that hands out a private copy reproduces the real race.
const kv = require('../lib/kv-store');

const withPrivateReads = async (run) => {
  const realRead = kv.read;
  kv.read = async (key, fallback) => {
    const value = await realRead(key, fallback);
    return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
  };
  try {
    return await run();
  } finally {
    kv.read = realRead;
  }
};

module.exports = { withPrivateReads };
