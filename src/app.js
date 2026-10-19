import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { listTransactions, dashboardStats, listAccounts, joinedTransaction, transactionView } from './repository.js';
import { listInput, uuid, HttpError } from './validation.js';
import { demoTransaction } from './demo.js';

export function createApp({ db, model, events, service, demoEnabled = false }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { 'script-src': ["'self'"],
    'style-src': ["'self'"], 'img-src': ["'self'", 'data:'], 'connect-src': ["'self'"],
    'upgrade-insecure-requests': null } } }));
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use('/api', rateLimit({ windowMs: 60000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many requests; retry in a minute.' } }));
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (!req.is('application/json')) return next(new HttpError(415, 'Use Content-Type: application/json.'));
      if (req.headers.origin && req.headers.origin !== `${req.protocol}://${req.get('host')}`)
        return next(new HttpError(403, 'Cross-origin writes are not allowed.'));
    }
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health', async (req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ok', storage: db.mode, demoEnabled, modelVersion: model.version });
  });
  app.get('/api/model', (req, res) => res.json({ version: model.version, threshold: model.threshold, ...model.report }));
  app.get('/api/accounts', async (req, res) => res.json(await listAccounts(db)));
  app.post('/api/accounts', async (req, res) => res.status(201).json(await service.addAccount(req.body)));
  app.get('/api/stats', async (req, res) => res.json(await dashboardStats(db)));
  app.get('/api/transactions', async (req, res) => res.json(await listTransactions(db, listInput(req.query))));
  app.post('/api/transactions', async (req, res) => {
    const result = await service.ingest(req.body);
    res.status(result.duplicate ? 200 : 201).json(result);
  });
  app.get('/api/transactions/:id', async (req, res) => {
    const row = (await db.query(`${joinedTransaction} WHERE t.id=$1`, [uuid(req.params.id)])).rows[0];
    if (!row) throw new HttpError(404, 'Transaction not found.');
    const reviews = (await db.query('SELECT verdict,note,created_at FROM reviews WHERE transaction_id=$1 ORDER BY created_at', [row.id])).rows;
    res.json({ ...transactionView(row), reviews });
  });
  app.post('/api/transactions/:id/review', async (req, res) => res.json(await service.review(req.params.id, req.body)));
  app.post('/api/demo/transactions', async (req, res) => {
    if (!demoEnabled) throw new HttpError(403, 'Synthetic simulation is disabled in this mode.');
    res.status(201).json(await service.ingest(demoTransaction()));
  });
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('event: ready\ndata: {}\n\n');
    const onChange = (change) => {
      if (res.writableLength > 65536) return res.end();
      res.write(`event: ${change.type}\ndata: ${JSON.stringify(change)}\n\n`);
    };
    events.on('change', onChange);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
    heartbeat.unref();
    req.on('close', () => { clearInterval(heartbeat); events.off('change', onChange); });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || (error.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? 'Request could not be completed. Check server logs.' : error.message });
  });
  return app;
}
