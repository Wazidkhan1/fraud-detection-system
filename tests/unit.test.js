import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFeatures, indicators, syntheticDataset, FEATURE_NAMES } from '../src/features.js';
import { evaluate } from '../src/network.js';
import { transactionInput, accountInput, listInput, uuid, reviewInput } from '../src/validation.js';

const valid = { externalId: 'test-1', accountId: 'AC-1001', merchant: 'Coffee', amountMinor: 20000,
  currency: 'INR', country: 'IN', deviceId: 'known', channel: 'upi' };
test('money validation rejects decimals, zero, unsafe numbers and wrong currencies', () => {
  for (const amountMinor of [0, -1, 0.1, NaN, Infinity, '200', 100000000001])
    assert.throws(() => transactionInput({ ...valid, amountMinor }), /amountMinor/);
  assert.throws(() => transactionInput({ ...valid, currency: 'USD' }), /INR/);
  assert.equal(transactionInput(valid).amountMinor, 20000);
});
test('transaction validation rejects non-objects, control characters and malformed fields', () => {
  for (const body of [null, [], 'input', { ...valid, country: 'India' }, { ...valid, channel: 'cash' },
    { ...valid, externalId: '' }, { ...valid, merchant: 'a\nb' }]) assert.throws(() => transactionInput(body));
});
test('account and review validation', () => {
  assert.throws(() => accountInput({}), /averageAmountMinor/);
  assert.throws(() => reviewInput({ verdict: 'approved', note: 'ok' }));
  assert.throws(() => reviewInput({ verdict: 'fraud', note: ' ' }));
  assert.deepEqual(reviewInput({ verdict: 'legitimate', note: ' Verified ' }), { verdict: 'legitimate', note: 'Verified' });
});
test('pagination and IDs reject ambiguous or invalid inputs', () => {
  for (const query of [{ limit: '0' }, { limit: '101' }, { offset: '-1' }, { risk: 'critical' }, { search: ['x'] }, { review: 'done' }])
    assert.throws(() => listInput(query));
  assert.equal(listInput({ limit: '10', offset: '20' }).offset, 20);
  assert.throws(() => uuid('not-a-uuid'));
});
test('feature values stay in the model domain for extreme valid input', () => {
  const features = extractFeatures({ amountMinor: 100000000000, averageAmountMinor: 1, foreign: true,
    newDevice: true, velocity: 1000, night: true, accountAgeDays: 5000, channel: 'bank_transfer' });
  assert.equal(features.length, FEATURE_NAMES.length);
  assert.ok(features.every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
});
test('risk indicators describe actual behavioral conditions', () => {
  assert.equal(indicators({ amountMinor: 100, averageAmountMinor: 100, foreign: false, newDevice: false,
    velocity: 0, night: false, accountAgeDays: 200 }).length, 0);
  assert.equal(indicators({ amountMinor: 1000, averageAmountMinor: 100, foreign: true, newDevice: true,
    velocity: 9, night: true, accountAgeDays: 1 }).length, 6);
});
test('seeded training fixtures are reproducible and holdout seeds are independent', () => {
  assert.deepEqual(syntheticDataset(10, 1), syntheticDataset(10, 1));
  assert.notDeepEqual(syntheticDataset(10, 1), syntheticDataset(10, 2));
});
test('precision, recall, F1 and confusion counts are computed correctly', () => {
  const report = evaluate([1, 0, 1, 0], [0.9, 0.8, 0.1, 0.2], 0.5);
  assert.deepEqual(report.confusion, { tp: 1, fp: 1, tn: 1, fn: 1 });
  assert.equal(report.precision, 0.5);
  assert.equal(report.recall, 0.5);
  assert.equal(report.f1, 0.5);
  assert.equal(evaluate([0], [0.1], 0.5).f1, 0);
});
