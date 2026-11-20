-- Native Northstar accounts. Passwords are stored only as PBKDF2 hashes.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disabled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE);

-- The initial private deployment supports one owner account; this prevents open public signups.
CREATE TRIGGER IF NOT EXISTS users_single_account
BEFORE INSERT ON users
WHEN EXISTS (SELECT 1 FROM users)
BEGIN
  SELECT RAISE(ABORT, 'registration closed');
END;
