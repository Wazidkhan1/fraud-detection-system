import { EventEmitter } from 'node:events';
import { createDatabase } from './db.js';
import { createModel } from './model.js';
import { createService } from './service.js';
import { seedDemo } from './demo.js';
import { createApp } from './app.js';

const forceDemo = process.argv.includes('--demo');
const db = await createDatabase({ databaseUrl: process.env.DATABASE_URL, forceDemo });
let model;
try { model = await createModel(); } catch (error) { await db.close(); throw error; }
const events = new EventEmitter();
events.setMaxListeners(200);
const service = createService({ db, model, events });
const demoEnabled = db.mode === 'demo' || process.env.SEED_DEMO === 'true';
if (demoEnabled) await seedDemo(db, service);
const app = createApp({ db, model, events, service, demoEnabled });
const port = Number(process.env.PORT || 3100), host = process.env.HOST || '127.0.0.1';
const server = app.listen(port, host, () => {
  console.log(`Sentinel running at http://${host}:${server.address().port}`);
  console.log(db.mode === 'demo' ? 'Demo: temporary embedded PostgreSQL; records reset when stopped.' : 'PostgreSQL: persistent database connection.');
});
server.on('error', async (error) => { console.error(error.message); await model.close(); await db.close(); process.exitCode = 1; });
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  server.close();
  server.closeAllConnections();
  await model.close();
  await db.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
