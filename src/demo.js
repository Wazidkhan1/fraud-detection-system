import { randomUUID } from 'node:crypto';
import { seededRandom } from './features.js';

export const DEMO_ACCOUNTS = [
  { id: 'AC-1001', name: 'Aarav Sharma', average: 250000, device: 'device-aarav' },
  { id: 'AC-1002', name: 'Diya Kapoor', average: 450000, device: 'device-diya' },
  { id: 'AC-1003', name: 'Kabir Mehta', average: 180000, device: 'device-kabir' },
  { id: 'AC-1004', name: 'Ananya Rao', average: 320000, device: 'device-ananya' },
  { id: 'AC-1005', name: 'Rohan Verma', average: 600000, device: 'device-rohan' },
];

export function demoTransaction(random = Math.random, suspicious = random() < 0.24) {
  const account = DEMO_ACCOUNTS[Math.floor(random() * DEMO_ACCOUNTS.length)];
  const normalMerchants = ['Blue Tokai Coffee', 'Amazon India', 'Swiggy', 'Reliance Fresh', 'BookMyShow', 'Indian Railways', 'Uber India'];
  return {
    externalId: `DEMO-${randomUUID()}`, accountId: account.id,
    merchant: suspicious ? 'Global Digital Exchange' : normalMerchants[Math.floor(random() * normalMerchants.length)],
    amountMinor: Math.round(account.average * (suspicious ? 7 + random() * 6 : 0.15 + random() * 1.7)),
    currency: 'INR', country: suspicious ? 'US' : 'IN',
    deviceId: suspicious ? `unknown-${Math.floor(random() * 10000)}` : account.device,
    channel: suspicious ? 'bank_transfer' : random() < 0.6 ? 'upi' : 'card',
  };
}

export async function seedDemo(db, service) {
  const created = new Date(Date.now() - 400 * 86400000).toISOString();
  for (const account of DEMO_ACCOUNTS) {
    await db.query(`INSERT INTO accounts(id,name,home_country,average_amount_minor,known_devices,created_at)
      VALUES($1,$2,'IN',$3,$4,$5) ON CONFLICT DO NOTHING`,
    [account.id, account.name, account.average, [account.device], created]);
  }
  const count = Number((await db.query('SELECT COUNT(*) AS total FROM transactions')).rows[0].total);
  if (count) return;
  const random = seededRandom(77);
  const start = Date.now() - 16 * 3600000;
  for (let i = 0; i < 64; i++) {
    await service.ingest(demoTransaction(random, i % 7 === 0), new Date(start + i * 15 * 60000));
  }
}
