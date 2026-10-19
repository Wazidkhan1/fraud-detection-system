CREATE TABLE IF NOT EXISTS accounts (
  id VARCHAR(40) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  home_country CHAR(2) NOT NULL,
  average_amount_minor BIGINT NOT NULL CHECK (average_amount_minor > 0),
  known_devices TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY,
  external_id VARCHAR(100) NOT NULL UNIQUE,
  request_fingerprint CHAR(64) NOT NULL,
  account_id VARCHAR(40) NOT NULL REFERENCES accounts(id),
  merchant VARCHAR(100) NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 100000000000),
  currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  country CHAR(2) NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('card','upi','bank_transfer')),
  risk_score SMALLINT NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_level VARCHAR(10) NOT NULL CHECK (risk_level IN ('low','medium','high')),
  model_version VARCHAR(80) NOT NULL,
  indicators JSONB NOT NULL,
  features JSONB NOT NULL,
  review_status VARCHAR(20) NOT NULL CHECK (review_status IN ('pending','not_required','fraud','legitimate')),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS transactions_time_idx ON transactions(created_at DESC, id);
CREATE INDEX IF NOT EXISTS transactions_account_time_idx ON transactions(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_review_idx ON transactions(review_status, created_at DESC);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  verdict VARCHAR(20) NOT NULL CHECK (verdict IN ('fraud','legitimate')),
  note VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
