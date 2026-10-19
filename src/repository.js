export function transactionView(row) {
  if (!row) return null;
  return {
    id: row.id, externalId: row.external_id, accountId: row.account_id, accountName: row.account_name,
    merchant: row.merchant, amountMinor: Number(row.amount_minor), currency: row.currency.trim(),
    country: row.country.trim(), deviceId: row.device_id, channel: row.channel,
    riskScore: row.risk_score, riskLevel: row.risk_level, indicators: row.indicators,
    features: row.features, modelVersion: row.model_version, reviewStatus: row.review_status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
export const joinedTransaction = 'SELECT t.*, a.name AS account_name FROM transactions t JOIN accounts a ON a.id = t.account_id';

export async function listTransactions(db, filters) {
  const values = [], clauses = [];
  function add(clause, value) { values.push(value); clauses.push(clause.replace('?', `$${values.length}`)); }
  if (filters.risk !== 'all') add('t.risk_level = ?', filters.risk);
  if (filters.review !== 'all') add('t.review_status = ?', filters.review);
  if (filters.search) {
    // Treat %, _ and backslash as literal search characters.
    const escaped = filters.search.replace(/[\\%_]/g, '\\$&');
    values.push(`%${escaped}%`);
    clauses.push(`(t.merchant ILIKE $${values.length} OR a.name ILIKE $${values.length} OR t.external_id ILIKE $${values.length})`);
  }
  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  const count = await db.query(`SELECT COUNT(*) AS total FROM transactions t JOIN accounts a ON a.id=t.account_id${where}`, values);
  const rows = await db.query(`${joinedTransaction}${where} ORDER BY t.created_at DESC, t.id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, filters.limit, filters.offset]);
  return { items: rows.rows.map(transactionView), total: Number(count.rows[0].total), limit: filters.limit, offset: filters.offset };
}

export async function dashboardStats(db) {
  const summary = await db.query(`SELECT COUNT(*) AS total,
    COALESCE(SUM(amount_minor), 0) AS volume,
    COUNT(*) FILTER (WHERE risk_level = 'high') AS high,
    COUNT(*) FILTER (WHERE risk_level = 'medium') AS medium,
    COUNT(*) FILTER (WHERE risk_level = 'low') AS low,
    COUNT(*) FILTER (WHERE review_status = 'pending') AS pending,
    COALESCE(SUM(amount_minor) FILTER (WHERE risk_level = 'high'),0) AS flagged_volume,
    COALESCE(AVG(risk_score),0) AS average_risk FROM transactions`);
  const hourly = await db.query(`SELECT date_trunc('hour',created_at) AS hour, COUNT(*) AS total,
    COUNT(*) FILTER (WHERE risk_level = 'high') AS flagged
    FROM transactions WHERE created_at >= now() - interval '24 hours'
    GROUP BY 1 ORDER BY 1`);
  const value = summary.rows[0];
  return { total: Number(value.total), volumeMinor: Number(value.volume), high: Number(value.high),
    medium: Number(value.medium), low: Number(value.low), pending: Number(value.pending),
    flaggedVolumeMinor: Number(value.flagged_volume), averageRisk: Number(value.average_risk),
    hourly: hourly.rows.map((row) => ({ hour: new Date(row.hour).toISOString(), total: Number(row.total), flagged: Number(row.flagged) })) };
}

export async function listAccounts(db) {
  const result = await db.query('SELECT * FROM accounts ORDER BY id');
  return result.rows.map((row) => ({ id: row.id, name: row.name, homeCountry: row.home_country.trim(),
    averageAmountMinor: Number(row.average_amount_minor), knownDevices: row.known_devices,
    createdAt: new Date(row.created_at).toISOString() }));
}
