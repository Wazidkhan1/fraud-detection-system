export const FEATURE_NAMES = [
  'log_amount', 'amount_to_average', 'foreign_country', 'new_device',
  'hourly_velocity', 'night_transaction', 'young_account', 'bank_transfer',
];
export const FEATURE_VERSION = 1;

const clip = (number) => Math.min(1, Math.max(0, number));

export function extractFeatures({ amountMinor, averageAmountMinor, foreign, newDevice,
  velocity, night, accountAgeDays, channel }) {
  return [
    clip(Math.log1p(amountMinor) / Math.log1p(100000000)),
    clip(amountMinor / averageAmountMinor / 10),
    Number(foreign), Number(newDevice), clip(velocity / 20), Number(night),
    1 - clip(accountAgeDays / 180), Number(channel === 'bank_transfer'),
  ];
}

export function indicators(context) {
  const result = [];
  const ratio = context.amountMinor / context.averageAmountMinor;
  if (ratio >= 3) result.push({ code: 'amount', label: `${ratio.toFixed(1)}× typical transaction amount` });
  if (context.foreign) result.push({ code: 'country', label: 'Country differs from account home country' });
  if (context.newDevice) result.push({ code: 'device', label: 'Device not in account profile' });
  if (context.velocity >= 5) result.push({ code: 'velocity', label: `${context.velocity} transactions in the preceding hour` });
  if (context.night) result.push({ code: 'night', label: 'Transaction between midnight and 05:00 IST' });
  if (context.accountAgeDays < 14) result.push({ code: 'account', label: 'Account is less than 14 days old' });
  return result;
}

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Synthetic independent train/validation/test fixtures, NOT banking records.
export function syntheticDataset(count, seed) {
  const random = seededRandom(seed);
  const rows = [];
  for (let i = 0; i < count; i++) {
    const suspicious = random() < 0.23;
    const averageAmountMinor = 50000 + random() * 700000;
    const ratio = suspicious ? 0.5 + random() * 14 : 0.1 + random() * 3.8;
    const context = {
      amountMinor: Math.round(averageAmountMinor * ratio), averageAmountMinor,
      foreign: random() < (suspicious ? 0.7 : 0.07),
      newDevice: random() < (suspicious ? 0.8 : 0.12),
      velocity: Math.floor(random() * (suspicious ? 22 : 7)),
      night: random() < (suspicious ? 0.5 : 0.15),
      accountAgeDays: random() * (suspicious ? 100 : 730),
      channel: random() < 0.25 ? 'bank_transfer' : 'card',
    };
    // Independent label noise prevents a perfect decision boundary.
    const noisy = random() < 0.035;
    rows.push({ features: extractFeatures(context), label: Number(noisy ? !suspicious : suspicious) });
  }
  return rows;
}
