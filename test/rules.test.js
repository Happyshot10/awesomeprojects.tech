'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../scripts/rules');

const reserved = ['www', 'admin'];
const ok = (records, github = 'alice') => ({ owner: { github }, records });
const tree = (entries, opts = {}) => R.checkTree(entries, { reserved, ...opts });

test('names', () => {
  assert.deepEqual(R.checkName('alice', reserved), []);
  assert.deepEqual(R.checkName('my-app2', reserved), []);
  assert.deepEqual(R.checkName('_vercel.alice', reserved), []);
  assert.deepEqual(R.checkName('s1._domainkey.alice', reserved), []);
  assert.ok(R.checkName('www', reserved).length);
  assert.ok(R.checkName('_vercel.www', reserved).length, 'reserved base under a prefix');
  assert.ok(R.checkName('Alice', reserved).length);
  assert.ok(R.checkName('-alice', reserved).length);
  assert.ok(R.checkName('alice-', reserved).length);
  assert.ok(R.checkName('xn--80ak6aa92e', reserved).length);
  assert.ok(R.checkName('_dmarc', reserved).length, 'underscore at top level');
  assert.ok(R.checkName('a'.repeat(64), reserved).length);
  assert.ok(R.checkName('a.b.c.d.e', reserved).length, 'too deep');
});

test('public IPs only', () => {
  for (const ip of ['1.1.1.1', '185.199.108.153', '76.76.21.21']) assert.ok(R.isPublicIPv4(ip), ip);
  for (const ip of ['10.0.0.1', '127.0.0.1', '192.168.1.1', '172.16.0.1', '172.31.255.255', '169.254.1.1',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '192.0.2.5', '203.0.113.9', '1.2.3', '01.2.3.4']) {
    assert.equal(R.isPublicIPv4(ip), false, ip);
  }
  for (const ip of ['2606:4700:4700::1111', '2a00:1450:4001:82a::200e']) assert.ok(R.isPublicIPv6(ip), ip);
  for (const ip of ['::', '::1', 'fd00::1', 'fe80::1', 'ff02::1', '2001:db8::1', '::ffff:10.0.0.1', '::ffff:1.1.1.1', 'nope']) {
    assert.equal(R.isPublicIPv6(ip), false, ip);
  }
});

test('records', () => {
  assert.deepEqual(R.checkRecords({ CNAME: 'alice.github.io' }, 'alice'), []);
  assert.deepEqual(R.checkRecords({ A: ['1.1.1.1', '1.0.0.1'], AAAA: ['2606:4700:4700::1111'], TXT: 'hello' }, 'alice'), []);
  assert.deepEqual(R.checkRecords({ MX: ['mx1.example.com', { host: 'mx2.example.com', priority: 20 }] }, 'alice'), []);

  assert.ok(R.checkRecords({}, 'alice').length, 'empty');
  assert.ok(R.checkRecords({ NS: ['ns1.example.com'] }, 'alice').length, 'no delegation');
  assert.ok(R.checkRecords({ CNAME: 'a.example.com', TXT: 'x' }, 'alice').length, 'CNAME is exclusive');
  assert.ok(R.checkRecords({ CNAME: '1.2.3.4' }, 'alice').length);
  assert.ok(R.checkRecords({ CNAME: 'bob.awesomeprojects.tech' }, 'alice').length, 'no chains into the zone');
  assert.ok(R.checkRecords({ CNAME: 'awesomeprojects.tech' }, 'alice').length);
  assert.ok(R.checkRecords({ CNAME: 'Alice.GitHub.io' }, 'alice').length, 'lowercase');
  assert.ok(R.checkRecords({ CNAME: 'localhost' }, 'alice').length, 'needs a dot');
  assert.ok(R.checkRecords({ A: '1.1.1.1' }, 'alice').length, 'A must be a list');
  assert.ok(R.checkRecords({ A: ['1.1.1.1', '1.1.1.1'] }, 'alice').length, 'duplicates');
  assert.ok(R.checkRecords({ A: ['10.0.0.1'] }, 'alice').length);
  assert.ok(R.checkRecords({ TXT: 'x'.repeat(256) }, 'alice').length);
  assert.ok(R.checkRecords({ TXT: 'tab\there' }, 'alice').length);
  assert.ok(R.checkRecords({ MX: [{ host: 'mx.example.com', priority: -1 }] }, 'alice').length);
});

test('entries', () => {
  assert.deepEqual(R.checkEntry('alice', { owner: { github: 'alice', email: 'a@b.co' }, description: 'hi', records: { CNAME: 'alice.github.io' } }), []);
  assert.ok(R.checkEntry('alice', { records: { CNAME: 'alice.github.io' } }).length, 'owner required');
  assert.ok(R.checkEntry('alice', { owner: { github: 'not a user!' }, records: { CNAME: 'a.github.io' } }).length);
  assert.ok(R.checkEntry('alice', { ...ok({ CNAME: 'a.github.io' }), extra: 1 }).length, 'unknown field');
  assert.ok(R.checkEntry('alice', { ...ok({ CNAME: 'a.github.io' }), repo: 'javascript:alert(1)' }).length);
  assert.ok(R.checkEntry('alice', []).length);
});

test('tree: nested names need a parent with the same owner', () => {
  assert.deepEqual(tree({ alice: ok({ CNAME: 'alice.github.io' }), '_vercel.alice': ok({ TXT: 'vc-123' }) }), {});
  assert.ok(tree({ '_vercel.alice': ok({ TXT: 'vc-123' }) })['_vercel.alice']);
  assert.ok(tree({ alice: ok({ CNAME: 'alice.github.io' }), '_vercel.alice': ok({ TXT: 'x' }, 'mallory') })['_vercel.alice']);
});

test('tree: per-owner limit', () => {
  const four = { a: ok({ TXT: 'x' }), b: ok({ TXT: 'x' }), c: ok({ TXT: 'x' }), d: ok({ TXT: 'x' }) };
  assert.equal(Object.keys(tree(four)).length, 4);
  assert.deepEqual(tree(four, { maintainers: ['Alice'] }), {});
  const three = { a: ok({ TXT: 'x' }), b: ok({ TXT: 'x' }), c: ok({ TXT: 'x' }), '_x.a': ok({ TXT: 'x' }) };
  assert.deepEqual(tree(three), {}, 'nested names do not count');
});

test('pull requests: ownership', () => {
  const files = {
    base: { 'domains/bob.json': ok({ CNAME: 'bob.github.io' }, 'bob') },
    head: {
      'domains/bob.json': ok({ CNAME: 'evil.example.com' }, 'mallory'),
      'domains/alice.json': ok({ CNAME: 'alice.github.io' }, 'alice'),
    },
  };
  const pr = (changes, author, maintainers) => R.checkPullRequest({
    changes, author, maintainers, before: (f) => files.base[f], after: (f) => files.head[f],
  });

  assert.deepEqual(pr([{ status: 'A', file: 'domains/alice.json' }], 'alice'), []);
  assert.deepEqual(pr([{ status: 'A', file: 'domains/alice.json' }], 'ALICE'), [], 'case-insensitive');
  assert.ok(pr([{ status: 'A', file: 'domains/alice.json' }], 'mallory').length, 'cannot add for someone else');
  assert.ok(pr([{ status: 'M', file: 'domains/bob.json' }], 'mallory').length, 'cannot take over');
  assert.ok(pr([{ status: 'D', file: 'domains/bob.json' }], 'mallory').length, 'cannot delete others');
  assert.ok(pr([{ status: 'M', file: 'domains/bob.json' }], 'bob').length, 'cannot hand it to someone else');
  assert.ok(pr([{ status: 'M', file: 'dnsconfig.js' }], 'alice').length, 'config is off limits');
  assert.ok(pr([{ status: 'A', file: 'domains/sub/x.json' }], 'alice').length);
  assert.deepEqual(pr([{ status: 'M', file: 'dnsconfig.js' }, { status: 'D', file: 'domains/bob.json' }], 'owner', ['owner']), []);
  assert.ok(pr([], '').length);
});
