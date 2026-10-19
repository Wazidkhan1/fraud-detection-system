import { parentPort } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import * as tf from '@tensorflow/tfjs';
import { createNetwork } from './network.js';
import { FEATURE_NAMES, FEATURE_VERSION } from './features.js';

try {
  await tf.setBackend('cpu');
  const artifact = JSON.parse(await readFile(new URL('../models/model.json', import.meta.url), 'utf8'));
  if (artifact.featureVersion !== FEATURE_VERSION || JSON.stringify(artifact.features) !== JSON.stringify(FEATURE_NAMES))
    throw new Error('Model features do not match this application. Run npm run train.');
  const model = createNetwork();
  const weights = artifact.weights.map((weight) => tf.tensor(weight.values, weight.shape));
  model.setWeights(weights);
  weights.forEach((weight) => weight.dispose());
  parentPort.on('message', ({ id, features }) => {
    try {
      if (features.length !== FEATURE_NAMES.length || features.some((value) => !Number.isFinite(value)))
        throw new Error('Invalid feature vector.');
      const score = tf.tidy(() => model.predict(tf.tensor2d([features])).dataSync()[0]);
      parentPort.postMessage({ id, score });
    } catch (error) { parentPort.postMessage({ id, error: error.message }); }
  });
  parentPort.postMessage({ ready: true, version: artifact.version, threshold: artifact.threshold, report: artifact.report });
} catch (error) {
  parentPort.postMessage({ startupError: `Cannot load model: ${error.message}. Run npm run train.` });
}
