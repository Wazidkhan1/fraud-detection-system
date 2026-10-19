# Sentinel — Fraud Detection System

A standalone project for your resume: a live fraud-operations dashboard backed by **Node.js, Express, TensorFlow.js, and PostgreSQL**. Submit transactions, inspect risk indicators, simulate live traffic, and record analyst review decisions.

This folder is independent of the photo-management app and the C++ compression project. It uses port **3100** by default.

## Run it now on Windows

Open a PowerShell terminal:

```powershell
cd "C:\Users\Wazid Khan\Desktop\institute-photo-management\fraud-detection-system"
npm.cmd install
npm.cmd run demo
```

Open **http://127.0.0.1:3100** in Chrome or Edge. The trained model is included. Node.js 22 or newer is required; this project was verified with Node 24.21.0. Using `npm.cmd` avoids PowerShell script-execution policy issues.

The demo uses **PGlite, an embedded PostgreSQL engine**, and the same SQL schema/repository used with a PostgreSQL server. It starts with 64 synthetic transactions and five account profiles. Demo records are temporary and disappear when the server stops. It requires no database installation or paid service.

If an installation in your environment reports a certificate-chain error, use your system certificate store for that terminal and retry; do not disable TLS verification:

```powershell
$env:NODE_OPTIONS = '--use-system-ca'
npm.cmd install
```

## Try the features

1. Click **Start simulation** to submit one generated transaction about every 2.5 seconds. New records update the dashboard through server-sent events. Click **Pause simulation** to stop.
2. Click **New transaction** and submit a normal INR payment using the account's prefilled device ID.
3. Compare it with a larger payment, a foreign country, and an unfamiliar device. The model produces a score and observed risk indicators.
4. Open a pending transaction, enter a note, and choose **Mark legitimate** or **Confirm fraud**. The decision is saved in review history.
5. Use **Transactions** for search and filters, **Review queue** for pending work, and **Model insights** for evaluation details.

Risk scores are model signals on a 0–100 display scale. They are not calibrated probabilities or proof of fraud. No payments are actually processed or blocked.

## Use a PostgreSQL server for persistence

Start PostgreSQL with the included Docker Compose file, or use your existing PostgreSQL server. Docker Desktop must be running for the Compose command.

```powershell
docker compose up -d postgres
Copy-Item .env.example .env
```

For a first-time setup, edit `.env`:

```dotenv
DATABASE_URL=postgresql://sentinel:sentinel_local_only@127.0.0.1:5434/sentinel
PORT=3100
HOST=127.0.0.1
SEED_DEMO=true
```

Then start the application:

```powershell
npm.cmd start
```

`npm start` reads `.env`. When `DATABASE_URL` is supplied, the app connects through the `pg` connection pool and applies the idempotent SQL schema. It fails visibly if the connection fails; it does not silently switch to demo storage. With no URL, it uses temporary embedded PostgreSQL. `npm run demo` explicitly selects demo storage and ignores any database URL.

Compose maps PostgreSQL to local port **5434**, so it can coexist with the other project's database. Its named volume preserves records across container restarts. The supplied password is for local development only.

Set `SEED_DEMO=false` to disable generated sample records and simulation in PostgreSQL mode. Add account profiles through `POST /api/accounts` before submitting transactions. An account profile contains its reference average transaction amount and known devices; this version does not automatically learn or update profiles from analyst verdicts.

## Commands

| Command | Purpose |
| --- | --- |
| `npm.cmd run demo` | Start the self-contained synthetic demonstration. |
| `npm.cmd start` | Start using `.env`, including PostgreSQL when configured. |
| `npm.cmd run train` | Retrain the included neural network on seeded synthetic data. |
| `npm.cmd test` | Run the unit and SQL/API integration tests. |
| `npm.cmd run check` | Check JavaScript syntax. |
| `npm.cmd run test:browser` | Start an isolated demo and test desktop/mobile browser flows. |

The browser check uses installed Playwright Chromium when available, otherwise installed Chrome. To use Edge, set `$env:BROWSER_CHANNEL='msedge'`. You can also install the matching test browser with `npx.cmd playwright install chromium`. The checker shuts down the server it owns and saves screenshots in `.data/`.

## How the system works

```mermaid
flowchart LR
  A[Dashboard or transaction client] --> B[Express validation]
  B --> C[Lock account and calculate behavior]
  C --> D[TensorFlow.js worker]
  D --> E[Commit transaction in PostgreSQL]
  E --> F[Server-sent event]
  F --> A
  A --> G[Analyst verdict and note]
  G --> H[Review history in PostgreSQL]
```

1. Validate money as integer **paise**, required fields, channel, and account ID.
2. Begin a SQL transaction and lock the account row. Count the account's transactions during the previous hour, so same-account requests cannot race the velocity calculation.
3. Extract eight normalized features: log amount, amount versus profile average, foreign country, unfamiliar device, hourly velocity, nighttime activity in IST, young account, and bank-transfer channel.
4. A worker thread runs an actual TensorFlow.js neural network: **8 inputs → 16 ReLU units → 8 ReLU units → 1 sigmoid output**.
5. Compare the raw model output with a threshold selected on validation F1. A high score enters the high-risk band; a score at least 55% of that threshold enters the medium band. Both await review. Low-risk records need no review. The displayed integer score is rounded after the risk-band decision.
6. Commit the transaction, model version, feature vector, and indicators. Only then publish the live event.
7. An analyst can resolve a pending transaction once. The verdict and note are recorded together in a SQL transaction.

Repeated submissions with the same `externalId` and normalized content return the existing transaction. Reusing that ID with different content returns `409`. Parameterized queries handle user input. Search treats SQL wildcard characters literally.

The indicators are explicit behavioral conditions, such as “device not in account profile”; they are not SHAP values or explanations of the neural network's internal decisions.

## Model evaluation

The included model trains on 3,200 generated transactions, selects a threshold on a separate 800-record validation set, and evaluates once on a separate 1,000-record test set. All three datasets use different fixed generator seeds. Training and inference use the pure-JavaScript TensorFlow CPU backend, so no native TensorFlow or Python installation is required.

The included artifact's **synthetic test-set** results are:

| Precision | Recall | F1 | True positives | False positives | True negatives | False negatives |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 92.18% | 90.32% | 91.24% | 224 | 19 | 733 | 24 |

These metrics describe the synthetic generator, not real financial fraud. The generator has a roughly 23% suspicious class and 3.5% label noise; these are artificial design choices. Real payment data typically has a different distribution. There is no claim of real-world accuracy, calibrated fraud probability, or production readiness. The model is a supervised classifier, not an independently trained unsupervised anomaly detector.

See [docs/MODEL_CARD.md](docs/MODEL_CARD.md) and [models/report.json](models/report.json). Running `npm run train` replaces the model artifacts; restart the server to load them. Real-data training, temporal/account-separated evaluation, calibration, and drift monitoring are future extensions.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Database mode and model version. |
| GET / POST | `/api/accounts` | List/create reference account profiles. |
| GET / POST | `/api/transactions` | Filter/list or score/store transactions. |
| GET | `/api/transactions/:id` | Transaction features, indicators, and review history. |
| POST | `/api/transactions/:id/review` | Resolve a pending signal with a verdict and note. |
| GET | `/api/stats` | Aggregate totals, risk distribution, and hourly activity. |
| GET | `/api/model` | Model card, threshold, and holdout metrics. |
| GET | `/api/events` | Live `transaction` and `review` SSE notifications. |
| POST | `/api/demo/transactions` | Generate a transaction when sample mode is enabled. |

Try a transaction while demo mode is running:

```powershell
$transaction = @{
    externalId = 'my-first-transaction'
    accountId = 'AC-1001'
    merchant = 'Example shop'
    amountMinor = 250000
    currency = 'INR'
    country = 'IN'
    deviceId = 'device-aarav'
    channel = 'upi'
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3100/api/transactions `
    -ContentType 'application/json' -Body $transaction
```

`250000` paise means **₹2,500.00**. List filters: `risk=all|low|medium|high`, `review=all|pending|fraud|legitimate|not_required`, `search`, `limit=1..100`, and `offset`. Review payload: `{"verdict":"fraud","note":"Reason for the decision"}`. Account example: `{"id":"AC-2001","name":"Example account","homeCountry":"IN","averageAmountMinor":250000,"knownDevices":["device-1"]}`.

## Validation

Verified locally on Windows with Node 24.21.0:

- **25 tests passed**, including real model inference, SQL persistence, validation, idempotent replay, concurrent duplicates, per-account velocity, transaction rollback, review races, search, and SSE lifecycle.
- Browser checks passed in installed Chrome for desktop and a 390-pixel mobile viewport: simulation, live updates, transaction entry, literal HTML escaping, review history, filtering, model insights, and mobile form controls. No browser runtime or console errors were recorded.
- SQL tests used the embedded PostgreSQL engine. A native PostgreSQL server was unavailable here, so the `pg` network connection and Compose startup were not verified locally. The included CI workflow supplies a PostgreSQL service for that additional check when published as a standalone repository.

To run the same API suite against a **dedicated disposable** PostgreSQL database, set `TEST_DATABASE_URL`. Its database name must end in `_test`; the tests **truncate the project tables**. Never point it at your application's data.

```powershell
$env:TEST_DATABASE_URL='postgresql://user:password@127.0.0.1:5432/sentinel_test'
npm.cmd test
Remove-Item Env:TEST_DATABASE_URL
```

## Project structure

```text
fraud-detection-system/
  public/                 Responsive HTML/CSS/JS dashboard
  src/app.js              Express routes, validation middleware, SSE
  src/service.js          Ingestion, behavioral features, review transactions
  src/repository.js       Parameterized SQL queries and dashboard aggregates
  src/db.js               PostgreSQL pool / embedded PostgreSQL adapters
  src/model*.js           TensorFlow inference worker and request bridge
  src/features.js         Feature pipeline and seeded synthetic generator
  db/001_initial.sql      Accounts, transactions, reviews, indexes, constraints
  models/                 Trained weights and evaluation report
  scripts/train.js        Reproducible synthetic training and threshold selection
  tests/                  Unit and integration tests
  compose.yaml            Local PostgreSQL server
  docs/                   Model card, design notes, and resume guide
```

This is a local portfolio application without user authentication or analyst identity verification. It binds to loopback by default. Live updates refresh dashboard state after reconnect; SSE is a live notification channel, not a durable message queue. Inference uses one bounded worker queue. Hourly velocity is calculated over stored transactions, and account baselines are supplied reference profiles. No email, SMS, banking, or payment-provider integration is included.

Read [docs/RESUME.md](docs/RESUME.md) for resume bullets and interview explanations. Implementation references: [TensorFlow.js in Node](https://www.tensorflow.org/js/guide/nodejs), [Express API](https://expressjs.com/en/5x/api/), [node-postgres parameterized queries](https://node-postgres.com/features/queries), and [PGlite](https://pglite.dev/docs/).
