# Resume entry and project explanation

**Sentinel — Real-Time Fraud Detection Dashboard | Node.js, Express, TensorFlow.js, PostgreSQL**

- Built a transaction-monitoring API and responsive dashboard using Express, PostgreSQL, and server-sent events, with live risk signals and an analyst review workflow.
- Implemented an eight-feature TensorFlow.js classifier in a worker thread, recording model versions and behavioral indicators for each scored transaction.
- Added idempotent transaction ingestion, per-account SQL locking, and atomic review history; verified behavior with 25 automated tests and desktop/mobile browser checks.

Optional measured bullet:

- Achieved **91.24% F1 on a held-out set of 1,000 synthetic transactions**, with validation-based threshold selection and explicit dataset limitations.

Always retain the word **synthetic** beside that metric. Do not claim real banking deployment, money saved, real-time latency percentiles, or production fraud accuracy. Add a repository link after you publish this folder as a standalone repository. Be ready to explain and modify the implementation and describe your own contribution honestly.

## Explain it in an interview

“Sentinel accepts transactions through a REST API. It validates the transaction, locks the account record, and calculates behavioral features from the account profile and recent transaction history. A TensorFlow.js worker produces a score. The API stores the transaction and model version in PostgreSQL, then pushes a live notification to the dashboard. An analyst can inspect a flagged transaction and record a verdict with an audit note. The included model trains on synthetic data, so its holdout metrics demonstrate the pipeline rather than real-world fraud performance.”

## Technical questions

**Why PostgreSQL?** Foreign keys link transactions to accounts, check constraints protect stored values, indexes support time/account/review queries, and SQL transactions keep review history consistent with the verdict.

**How do you handle concurrent transactions?** Ingestion locks the relevant account row using `FOR UPDATE` before counting previous-hour transactions and scoring. Requests for the same account wait for earlier commits. A unique external ID prevents duplicate records. Requests using the same ID with different normalized content receive a conflict.

**Why a worker thread?** The portable TensorFlow.js CPU backend performs CPU work. Running inference in a worker keeps that work off the main HTTP event loop. The bridge caps outstanding predictions at 128 and gives each a timeout. A single worker still limits overall throughput; no horizontal-scaling or latency claim is made.

**Why send the event after commit?** A live notification should point to data that is already committed and queryable. SSE is not a durable queue: a disconnect can lose notifications, so the dashboard refreshes state on reconnect.

**Why store money in paise?** Integer minor units avoid floating-point rounding during storage and validation. PostgreSQL stores amounts as BIGINT, with supported individual values bounded by API and database constraints.

**How did you select the threshold?** Optimize F1 over a fixed grid using only validation data. Report the selected threshold's precision, recall, and F1 on an independent generated test set.

**Are the reasons actual neural-network explanations?** No. They are observed behavioral conditions such as a new device or an amount above the profile's usual value. The UI labels them as indicators rather than feature attributions.

**Why not report accuracy alone?** When fraud is rare, a model predicting “legitimate” for everything can have deceptively high accuracy. Precision, recall, F1, and confusion counts explain errors more clearly.

**What would you improve?** Real-data training and temporal evaluation, calibrated probabilities, a monitored feature pipeline, analyst authentication and attribution, account-profile updates, durable alerts, model drift checks, and measured load testing. These are future improvements, not implemented features.

## Five-minute demonstration

1. Start with `npm.cmd run demo` and open the dashboard.
2. Start and pause simulation to demonstrate committed transactions arriving through SSE.
3. Submit a normal transaction, then compare one with a larger amount, foreign country, and unknown device.
4. Review a pending signal and show its persisted decision history.
5. Open Model insights; explain the synthetic test metrics and their limitations.
6. Show `npm.cmd test`, the SQL schema, and the idempotency/concurrency tests.
