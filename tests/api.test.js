import { describe, test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../src/db.js';
import { createModel } from '../src/model.js';
import { createService } from '../src/service.js';
import { createApp } from '../src/app.js';

describe('API and PostgreSQL integration', () => {
  let db, model, events, service, server, base;
  const body = (overrides = {}) => ({ externalId: `test-${randomUUID()}`, accountId: 'test-account',
    merchant: 'Test merchant', amountMinor: 200000, currency: 'INR', country: 'IN', deviceId: 'known-device', channel: 'upi', ...overrides });
  async function request(path, method = 'GET', value, extra = {}) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...extra },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    return { status: response.status, body: await response.json() };
  }
  before(async () => {
    if (process.env.TEST_DATABASE_URL && !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test'))
      throw new Error('TEST_DATABASE_URL must name a dedicated database ending in _test; tests clear its tables.');
    db = await createDatabase({ databaseUrl: process.env.TEST_DATABASE_URL });
    await db.exec('TRUNCATE TABLE reviews, transactions, accounts');
    model = await createModel(); events = new EventEmitter();
    service = createService({ db, model, events });
    await service.addAccount({ id: 'test-account', name: 'Test Account', homeCountry: 'IN', averageAmountMinor: 250000,
      knownDevices: ['known-device'], createdAt: '2024-01-01T00:00:00Z' });
    server = createApp({ db, model, events, service }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  beforeEach(async () => { await db.exec('TRUNCATE TABLE reviews, transactions'); });
  after(async () => {
    server?.close(); server?.closeAllConnections();
    if (model) await model.close();
    if (db) await db.close();
  });
  test('health, model metadata and seeded account profile are available', async () => {
    assert.equal((await request('/health')).body.status, 'ok');
    assert.equal((await request('/model')).body.test.count, 1000);
    assert.equal((await request('/accounts')).body[0].name, 'Test Account');
  });
  test('worker gives a larger score to a suspicious transaction', async () => {
    const ordinary = await service.ingest(body());
    const suspicious = await service.ingest(body({ amountMinor: 25000000, deviceId: 'unknown', country: 'US', channel: 'bank_transfer' }));
    assert.ok(suspicious.transaction.riskScore > ordinary.transaction.riskScore);
    assert.equal(suspicious.transaction.riskLevel, 'high');
    assert.equal(suspicious.transaction.reviewStatus, 'pending');
  });
  test('valid ingestion persists money, features, indicators and model version', async () => {
    const result = await request('/transactions', 'POST', body({ merchant: '<script>alert(1)</script>' }));
    assert.equal(result.status, 201);
    assert.equal(result.body.transaction.amountMinor, 200000);
    assert.equal(result.body.transaction.features.length, 8);
    assert.equal(result.body.transaction.modelVersion, model.version);
    const details = await request(`/transactions/${result.body.transaction.id}`);
    assert.equal(details.body.merchant, '<script>alert(1)</script>');
    assert.deepEqual(details.body.reviews, []);
  });
  test('identical external ID replay is idempotent and emits one event', async () => {
    const input = body(); let count = 0;
    const listener = () => count++;
    events.on('change', listener);
    try {
      const first = await request('/transactions', 'POST', input);
      const second = await request('/transactions', 'POST', input);
      assert.equal(first.status, 201); assert.equal(second.status, 200);
      assert.equal(first.body.transaction.id, second.body.transaction.id);
      assert.equal(second.body.duplicate, true); assert.equal(count, 1);
      assert.equal((await request('/stats')).body.total, 1);
    } finally { events.off('change', listener); }
  });
  test('external ID reused with different content returns conflict', async () => {
    const input = body(); await service.ingest(input);
    assert.equal((await request('/transactions', 'POST', { ...input, amountMinor: 1 })).status, 409);
  });
  test('concurrent duplicate requests commit one record', async () => {
    const input = body();
    const results = await Promise.all(Array.from({ length: 4 }, () => request('/transactions', 'POST', input)));
    assert.equal(results.filter((result) => result.status === 201).length, 1);
    assert.equal((await request('/stats')).body.total, 1);
  });
  test('behavioral velocity includes prior same-account commits', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => service.ingest(body())));
    const velocities = results.map((result) => result.transaction.features[4] * 20).sort((a, b) => a - b);
    assert.deepEqual(velocities, [0, 1, 2, 3, 4, 5]);
    // Concurrent requests can acquire the account lock in any order.
    for (const { transaction } of results) {
      assert.equal(transaction.indicators.some((indicator) => indicator.code === 'velocity'),
        transaction.features[4] * 20 >= 5);
    }
  });
  test('invalid transactions and unknown accounts leave the ledger empty', async () => {
    assert.equal((await request('/transactions', 'POST', body({ amountMinor: 1.5 }))).status, 400);
    assert.equal((await request('/transactions', 'POST', body({ accountId: 'unknown' }))).status, 404);
    assert.equal((await request('/stats')).body.total, 0);
  });
  test('model errors roll back writes and do not emit alerts', async () => {
    const broken = createService({ db, events, model: { ...model, predict: async () => { throw new Error('Unavailable'); } } });
    await assert.rejects(() => broken.ingest(body()), /Unavailable/);
    assert.equal((await request('/stats')).body.total, 0);
  });
  test('search, pagination, risk and review filters return correct counts', async () => {
    await service.ingest(body({ merchant: 'Unique Coffee 100%' }));
    await service.ingest(body({ merchant: 'Suspicious Shop', amountMinor: 25000000, country: 'US', deviceId: 'new', channel: 'bank_transfer' }));
    assert.equal((await request('/transactions?search=100%25')).body.total, 1);
    assert.equal((await request('/transactions?search=%27%20OR%201%3D1--')).body.total, 0);
    assert.equal((await request('/transactions?risk=high&review=pending')).body.total, 1);
    const result = await request('/transactions?limit=1&offset=1');
    assert.equal(result.body.items.length, 1); assert.equal(result.body.total, 2);
    assert.equal((await request('/transactions?limit=0')).status, 400);
  });
  test('review transition saves audit history and prevents a second verdict', async () => {
    const result = await service.ingest(body({ amountMinor: 25000000, country: 'US', deviceId: 'new', channel: 'bank_transfer' }));
    const id = result.transaction.id;
    assert.equal((await request(`/transactions/${id}/review`, 'POST', { verdict: 'fraud', note: 'Verified unusual activity' })).status, 200);
    const details = (await request(`/transactions/${id}`)).body;
    assert.equal(details.reviewStatus, 'fraud');
    assert.equal(details.reviews.length, 1); assert.equal(details.reviews[0].note, 'Verified unusual activity');
    assert.equal((await request(`/transactions/${id}/review`, 'POST', { verdict: 'legitimate', note: 'Change' })).status, 409);
    assert.equal((await request('/stats')).body.pending, 0);
  });
  test('concurrent review decisions create only one audit record', async () => {
    const result = await service.ingest(body({ amountMinor: 25000000, country: 'US', deviceId: 'new', channel: 'bank_transfer' }));
    const outcomes = await Promise.all(['fraud', 'legitimate'].map((verdict) => request(`/transactions/${result.transaction.id}/review`, 'POST', { verdict, note: 'Concurrent decision' })));
    assert.deepEqual(outcomes.map((outcome) => outcome.status).sort(), [200, 409]);
    assert.equal((await request(`/transactions/${result.transaction.id}`)).body.reviews.length, 1);
  });
  test('malformed IDs, invalid JSON, unsupported content type and cross-origin writes fail cleanly', async () => {
    assert.equal((await request('/transactions/bad-id')).status, 400);
    assert.equal((await request('/transactions', 'POST', body(), { Origin: 'https://other.example' })).status, 403);
    const invalidJson = await fetch(base + '/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(invalidJson.status, 400);
    const wrongType = await fetch(base + '/transactions', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'text' });
    assert.equal(wrongType.status, 415);
    assert.equal((await request('/missing')).status, 404);
  });
  test('SSE publishes transaction events after a committed write and cleans up listeners', async () => {
    const controller = new AbortController();
    const response = await fetch(base + '/events', { signal: controller.signal });
    const reader = response.body.getReader();
    try {
      assert.match(new TextDecoder().decode((await reader.read()).value), /event: ready/);
      await service.ingest(body());
      const next = await Promise.race([reader.read(), new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('SSE timed out')), 2000); timer.unref();
      })]);
      assert.match(new TextDecoder().decode(next.value), /event: transaction/);
    } finally { controller.abort(); await reader.cancel().catch(() => {}); }
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(events.listenerCount('change'), 0);
  });
  test('demo generation is disabled when explicitly configured off', async () => {
    assert.equal((await request('/demo/transactions', 'POST', {})).status, 403);
  });
  test('account creation validates inputs and rejects duplicate IDs', async () => {
    const input = { id: 'api-account', name: 'New account', homeCountry: 'IN', averageAmountMinor: 50000, knownDevices: ['device-1'] };
    assert.equal((await request('/accounts', 'POST', input)).status, 201);
    assert.equal((await request('/accounts', 'POST', input)).status, 409);
  });
  test('worker rejects invalid feature vectors without stopping subsequent inference', async () => {
    await assert.rejects(() => model.predict([1, 2]), /Invalid feature/);
    assert.ok(Number.isFinite(await model.predict([0.5, 0.1, 0, 0, 0, 0, 0, 0])));
  });
});
