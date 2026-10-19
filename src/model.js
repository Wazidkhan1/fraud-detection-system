import { Worker } from 'node:worker_threads';

export async function createModel() {
  const worker = new Worker(new URL('./model-worker.js', import.meta.url));
  const pending = new Map();
  let serial = 0, available = true;
  const failAll = (error) => {
    available = false;
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); }
    pending.clear();
  };
  worker.on('error', failAll);
  worker.on('exit', () => failAll(new Error('Model worker stopped.')));
  let metadata;
  try {
    metadata = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Model initialization timed out.')), 30000);
      const onError = (error) => { clearTimeout(timer); reject(error); };
      worker.once('error', onError);
      worker.once('message', (message) => {
        clearTimeout(timer);
        worker.off('error', onError);
        message.ready ? resolve(message) : reject(new Error(message.startupError || 'Model failed to initialize.'));
      });
    });
  } catch (error) { await worker.terminate(); throw error; }
  worker.on('message', ({ id, score, error }) => {
    const item = pending.get(id);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(id);
    error ? item.reject(new Error(error)) : item.resolve(score);
  });
  return {
    ...metadata,
    predict(features) {
      if (!available) return Promise.reject(new Error('Model worker is unavailable.'));
      if (pending.size >= 128) return Promise.reject(new Error('Model queue is full; retry shortly.'));
      const id = ++serial;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Model inference timed out.')); }, 10000);
        pending.set(id, { resolve, reject, timer });
        worker.postMessage({ id, features });
      });
    },
    async close() { failAll(new Error('Model shut down.')); await worker.terminate(); },
  };
}
