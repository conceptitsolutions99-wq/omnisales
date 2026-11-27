// kv.update rewrites a whole record map, so a caller that only read it must not cost a write.
// In the in-memory store the write is observable by identity: the stored value is the object that
// was set, so a skipped write leaves the previous object in place.
process.env.DATABASE_URL = '';

const test = require('node:test');
const assert = require('node:assert/strict');

const kv = require('../lib/kv-store');

const uniqueKey = (name) => `test:kv-update:${name}:${Math.random().toString(36).slice(2)}`;

test('an unchanged value is not written back', async () => {
  const key = uniqueKey('unchanged');
  const original = { one: { id: 1 }, two: { id: 2 } };
  await kv.update(key, {}, () => original);

  // A clone with the same content is a mutator that decided nothing needed changing
  const clone = JSON.parse(JSON.stringify(original));
  const returned = await kv.update(key, {}, () => clone);

  assert.deepEqual(returned, original);
  assert.equal(
    await kv.read(key, null),
    original,
    'the stored value is still the first object, so the clone was never written'
  );
});

test('a real change is written', async () => {
  const key = uniqueKey('changed');
  await kv.update(key, {}, () => ({ a: 1 }));
  await kv.update(key, {}, (current) => ({ ...current, b: 2 }));

  assert.deepEqual(await kv.read(key, null), { a: 1, b: 2 });
});

test('a mutator that changes the map in place still writes', async () => {
  const key = uniqueKey('in-place');
  await kv.update(key, {}, () => ({ a: 1 }));

  await kv.update(key, {}, (current) => {
    current.b = 2;
    return current;
  });

  assert.deepEqual(await kv.read(key, null), { a: 1, b: 2 });
});

test('null means nothing changed', async () => {
  const key = uniqueKey('null');
  const original = { a: 1 };
  await kv.update(key, {}, () => original);

  const returned = await kv.update(key, {}, () => null);

  assert.equal(returned, original, 'the caller gets the value that is there');
  assert.equal(await kv.read(key, null), original);
});

test('the lock still serialises writers that do change the map', async () => {
  const key = uniqueKey('serial');
  await kv.update(key, {}, () => ({ seen: [] }));

  await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      kv.update(key, {}, (current) => ({ ...current, seen: [...current.seen, index] }))
    )
  );

  const stored = await kv.read(key, { seen: [] });
  assert.equal(stored.seen.length, 8, 'every writer’s change is in the row');
});
