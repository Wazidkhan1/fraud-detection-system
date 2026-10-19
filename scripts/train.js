import * as tf from '@tensorflow/tfjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { FEATURE_NAMES, FEATURE_VERSION, syntheticDataset } from '../src/features.js';
import { createNetwork, evaluate } from '../src/network.js';

await tf.setBackend('cpu');
const train = syntheticDataset(3200, 101);
const validation = syntheticDataset(800, 202);
const test = syntheticDataset(1000, 303);
const model = createNetwork();
const optimizer = tf.train.adam(0.006);
model.compile({ optimizer, loss: 'binaryCrossentropy' });
const x = tf.tensor2d(train.map((row) => row.features));
const y = tf.tensor2d(train.map((row) => [row.label]));
console.log('Training on 3,200 synthetic transactions (CPU; no native TensorFlow install needed).');
await model.fit(x, y, { epochs: 24, batchSize: 64, shuffle: false,
  callbacks: { onEpochEnd: (epoch, logs) => {
    if ((epoch + 1) % 6 === 0) console.log(`Epoch ${epoch + 1}/24, loss ${logs.loss.toFixed(4)}`);
  } },
});
const predict = (rows) => tf.tidy(() => Array.from(model.predict(tf.tensor2d(rows.map((row) => row.features))).dataSync()));
const validationScores = predict(validation);
const validationLabels = validation.map((row) => row.label);
let threshold = 0.5, best = -1;
for (let step = 10; step <= 90; step += 5) {
  const score = evaluate(validationLabels, validationScores, step / 100).f1;
  if (score > best) { best = score; threshold = step / 100; }
}
const weights = model.getWeights().map((weight) => ({ shape: weight.shape, values: Array.from(weight.dataSync()) }));
const version = `sentinel-${createHash('sha256').update(JSON.stringify(weights)).digest('hex').slice(0, 12)}`;
const artifact = {
  version, featureVersion: FEATURE_VERSION, features: FEATURE_NAMES, threshold, weights,
  report: {
    dataset: 'Seeded synthetic transactions; not real financial data',
    trainedAt: new Date().toISOString(), framework: `TensorFlow.js ${tf.version.tfjs}`,
    architecture: '8 inputs → Dense(16, ReLU) → Dense(8, ReLU) → Dense(1, sigmoid)',
    trainCount: train.length, validationCount: validation.length, testCount: test.length,
    epochs: 24, batchSize: 64, threshold,
    validation: evaluate(validationLabels, validationScores, threshold),
    test: evaluate(test.map((row) => row.label), predict(test), threshold),
    limitations: 'Synthetic holdout metrics describe the generator only. Scores are not calibrated probabilities. No real-world fraud performance is established.',
  },
};
await mkdir(new URL('../models/', import.meta.url), { recursive: true });
await writeFile(new URL('../models/model.json', import.meta.url), JSON.stringify(artifact, null, 2) + '\n');
await writeFile(new URL('../models/report.json', import.meta.url), JSON.stringify(artifact.report, null, 2) + '\n');
console.log(JSON.stringify({ version, threshold, syntheticTest: artifact.report.test }, null, 2));
x.dispose(); y.dispose(); model.dispose(); optimizer.dispose();
