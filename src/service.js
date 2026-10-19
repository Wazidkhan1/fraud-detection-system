import { randomUUID, createHash } from 'node:crypto';
import { extractFeatures, indicators } from './features.js';
import { transactionInput, HttpError, reviewInput, uuid, accountInput } from './validation.js';
import { transactionView, joinedTransaction } from './repository.js';

export function createService({ db, model, events }) {
  async function ingest(body, now = new Date()) {
    const input = transactionInput(body);
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const result = await db.transaction(async (client) => {
      // Serialize same-account requests so velocity includes every earlier commit.
      const account = (await client.query('SELECT * FROM accounts WHERE id=$1 FOR UPDATE', [input.accountId])).rows[0];
      if (!account) throw new HttpError(404, 'Account not found.');
      const existing = (await client.query(`${joinedTransaction} WHERE external_id=$1`, [input.externalId])).rows[0];
      if (existing) {
        if (existing.request_fingerprint !== fingerprint) throw new HttpError(409, 'externalId is already used by a different transaction.');
        return { transaction: transactionView(existing), duplicate: true };
      }
      const recent = await client.query(`SELECT COUNT(*) AS total FROM transactions WHERE account_id=$1
        AND created_at >= $2 AND created_at <= $3`, [input.accountId, new Date(now.getTime() - 3600000).toISOString(), now.toISOString()]);
      const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(now));
      const context = {
        ...input, averageAmountMinor: Number(account.average_amount_minor),
        foreign: input.country !== account.home_country.trim(),
        newDevice: !account.known_devices.includes(input.deviceId),
        velocity: Number(recent.rows[0].total), night: hour < 5,
        accountAgeDays: Math.max(0, (now - new Date(account.created_at)) / 86400000),
      };
      const features = extractFeatures(context);
      const score = await model.predict(features);
      if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error('Model returned an invalid score.');
      const riskLevel = score >= model.threshold ? 'high' : score >= model.threshold * 0.55 ? 'medium' : 'low';
      const id = randomUUID();
      const inserted = await client.query(`INSERT INTO transactions(id,external_id,request_fingerprint,account_id,
        merchant,amount_minor,currency,country,device_id,channel,risk_score,risk_level,model_version,
        indicators,features,review_status,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT(external_id) DO NOTHING RETURNING id`, [id, input.externalId, fingerprint, input.accountId,
        input.merchant, input.amountMinor, input.currency, input.country, input.deviceId, input.channel,
        Math.round(score * 100), riskLevel, model.version, JSON.stringify(indicators(context)), JSON.stringify(features),
        riskLevel === 'low' ? 'not_required' : 'pending', now.toISOString()]);
      if (!inserted.rows.length) {
        const duplicate = (await client.query(`${joinedTransaction} WHERE external_id=$1`, [input.externalId])).rows[0];
        if (!duplicate || duplicate.request_fingerprint !== fingerprint) throw new HttpError(409, 'externalId is already used by a different transaction.');
        return { transaction: transactionView(duplicate), duplicate: true };
      }
      const row = (await client.query(`${joinedTransaction} WHERE t.id=$1`, [id])).rows[0];
      return { transaction: transactionView(row), duplicate: false };
    });
    if (!result.duplicate) events.emit('change', { type: 'transaction', id: result.transaction.id, riskLevel: result.transaction.riskLevel });
    return result;
  }

  async function review(id, body) {
    uuid(id);
    const input = reviewInput(body);
    const transaction = await db.transaction(async (client) => {
      const updated = await client.query(`UPDATE transactions SET review_status=$2 WHERE id=$1 AND review_status='pending' RETURNING id`, [id, input.verdict]);
      if (!updated.rows.length) {
        const found = (await client.query('SELECT id FROM transactions WHERE id=$1', [id])).rows.length;
        throw new HttpError(found ? 409 : 404, found ? 'This transaction is not awaiting review.' : 'Transaction not found.');
      }
      await client.query('INSERT INTO reviews(id,transaction_id,verdict,note) VALUES($1,$2,$3,$4)',
        [randomUUID(), id, input.verdict, input.note]);
      return transactionView((await client.query(`${joinedTransaction} WHERE t.id=$1`, [id])).rows[0]);
    });
    events.emit('change', { type: 'review', id });
    return transaction;
  }

  async function addAccount(body) {
    const input = accountInput(body);
    const result = await db.query(`INSERT INTO accounts(id,name,home_country,average_amount_minor,known_devices,created_at)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id`,
    [input.id, input.name, input.homeCountry, input.averageAmountMinor, input.knownDevices, input.createdAt]);
    if (!result.rows.length) throw new HttpError(409, 'Account ID already exists.');
    return input;
  }
  return { ingest, review, addAccount };
}
