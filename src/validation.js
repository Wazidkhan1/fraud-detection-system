export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Expected a JSON object.');
}
function text(value, name, max = 100) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\x00-\x1f]/.test(value))
    throw new HttpError(400, `${name} must be 1–${max} printable characters.`);
  return value.trim();
}
function country(value) {
  if (typeof value !== 'string' || !/^[A-Z]{2}$/.test(value)) throw new HttpError(400, 'Country must be a two-letter uppercase code.');
  return value;
}
export function transactionInput(body) {
  object(body);
  const result = {
    externalId: text(body.externalId, 'externalId'),
    accountId: text(body.accountId, 'accountId', 40),
    merchant: text(body.merchant, 'merchant'),
    amountMinor: body.amountMinor,
    currency: body.currency ?? 'INR',
    country: country(body.country),
    deviceId: text(body.deviceId, 'deviceId'),
    channel: body.channel,
  };
  if (!Number.isSafeInteger(result.amountMinor) || result.amountMinor <= 0 || result.amountMinor > 100000000000)
    throw new HttpError(400, 'amountMinor must be an integer from 1 to 100000000000 (paise).');
  if (result.currency !== 'INR') throw new HttpError(400, 'This project currently supports INR only.');
  if (!['card', 'upi', 'bank_transfer'].includes(result.channel)) throw new HttpError(400, 'Invalid transaction channel.');
  return result;
}
export function accountInput(body) {
  object(body);
  if (!Number.isSafeInteger(body.averageAmountMinor) || body.averageAmountMinor <= 0 || body.averageAmountMinor > 100000000000)
    throw new HttpError(400, 'averageAmountMinor must be a positive integer in paise (maximum 100000000000).');
  if (!Array.isArray(body.knownDevices) || body.knownDevices.length > 20) throw new HttpError(400, 'knownDevices must be an array of at most 20 devices.');
  const createdAt = new Date(body.createdAt ?? Date.now());
  if (!Number.isFinite(createdAt.getTime()) || createdAt > new Date()) throw new HttpError(400, 'Invalid account creation date.');
  return { id: text(body.id, 'id', 40), name: text(body.name, 'name'), homeCountry: country(body.homeCountry),
    averageAmountMinor: body.averageAmountMinor, knownDevices: body.knownDevices.map((device) => text(device, 'device')),
    createdAt: createdAt.toISOString() };
}
export function listInput(query) {
  const parse = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) > max) throw new HttpError(400, 'Invalid pagination.');
    return Number(value);
  };
  const risk = query.risk ?? 'all', review = query.review ?? 'all';
  if (!['all', 'low', 'medium', 'high'].includes(risk)) throw new HttpError(400, 'Invalid risk filter.');
  if (!['all', 'pending', 'fraud', 'legitimate', 'not_required'].includes(review)) throw new HttpError(400, 'Invalid review filter.');
  if (query.search !== undefined && typeof query.search !== 'string') throw new HttpError(400, 'Invalid search.');
  const search = (query.search ?? '').slice(0, 100);
  const limit = parse(query.limit, 12, 100);
  if (limit < 1) throw new HttpError(400, 'Limit must be at least one.');
  return { risk, review, search, limit, offset: parse(query.offset, 0, 10000000) };
}
export function reviewInput(body) {
  object(body);
  if (!['fraud', 'legitimate'].includes(body.verdict)) throw new HttpError(400, 'Review verdict must be fraud or legitimate.');
  return { verdict: body.verdict, note: text(body.note, 'note', 500) };
}
export function uuid(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new HttpError(400, 'Invalid transaction ID.');
  return value;
}
