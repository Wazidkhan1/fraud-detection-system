import * as tf from '@tensorflow/tfjs';
import { FEATURE_NAMES } from './features.js';

export function createNetwork() {
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [FEATURE_NAMES.length], units: 16, activation: 'relu',
    kernelInitializer: tf.initializers.glorotUniform({ seed: 17 }) }));
  model.add(tf.layers.dense({ units: 8, activation: 'relu',
    kernelInitializer: tf.initializers.glorotUniform({ seed: 29 }) }));
  model.add(tf.layers.dense({ units: 1, activation: 'sigmoid',
    kernelInitializer: tf.initializers.glorotUniform({ seed: 43 }) }));
  return model;
}

export function evaluate(labels, scores, threshold) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  scores.forEach((score, index) => {
    if (score >= threshold) labels[index] ? tp++ : fp++;
    else labels[index] ? fn++ : tn++;
  });
  const precision = tp / (tp + fp || 1);
  const recall = tp / (tp + fn || 1);
  return { precision, recall, f1: 2 * precision * recall / (precision + recall || 1),
    accuracy: (tp + tn) / labels.length, confusion: { tp, fp, tn, fn }, count: labels.length };
}
