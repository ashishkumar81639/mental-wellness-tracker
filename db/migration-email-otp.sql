-- Migration: add email-based OTP auth.
-- Idempotent: safe to re-run. Run against DATABASE_URL after schema.sql.
-- Brings the live DB in line with db/schema.sql for existing installs.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS voice_chars_used BIGINT NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email) WHERE email IS NOT NULL;

-- Backfill the demo user so the seed login still works after the switch to
-- email-as-identity. Adjust the email if you want a different demo address.
UPDATE users
SET email = 'demo@yaarhelp.in', email_verified = TRUE
WHERE id = 'demo_user' AND email IS NULL;

CREATE TABLE IF NOT EXISTS otp_codes (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  purpose     TEXT NOT NULL CHECK (purpose IN ('signup', 'reset')),
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_active ON otp_codes (email, purpose) WHERE consumed_at IS NULL;

-- Waitlist (LAUNCH-PREP §5): demand signal for the payment-gateway trigger.
CREATE TABLE IF NOT EXISTS waitlist (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  email      TEXT NOT NULL UNIQUE,
  reason     TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
