-- ================================================================
-- METTLESTATE × EA FC MOBILE LEAGUE — Database Schema v2.0
-- ================================================================

-- Users (admin accounts — you + helpers)
CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  username     VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  password_hash VARCHAR(255) NOT NULL,
  role         VARCHAR(20) NOT NULL DEFAULT 'admin',  -- 'owner' | 'admin'
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login   TIMESTAMPTZ
);

-- League players
CREATE TABLE IF NOT EXISTS players (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  username       VARCHAR(50) UNIQUE NOT NULL,
  phone          VARCHAR(30) DEFAULT '',
  played         INTEGER NOT NULL DEFAULT 0,
  wins           INTEGER NOT NULL DEFAULT 0,
  draws          INTEGER NOT NULL DEFAULT 0,
  losses         INTEGER NOT NULL DEFAULT 0,
  points         INTEGER NOT NULL DEFAULT 0,
  gf             INTEGER NOT NULL DEFAULT 0,
  ga             INTEGER NOT NULL DEFAULT 0,
  form           JSONB NOT NULL DEFAULT '[]'::jsonb,
  postponements  INTEGER NOT NULL DEFAULT 20,
  suspended      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Scheduled fixtures
CREATE TABLE IF NOT EXISTS fixtures (
  id             BIGINT PRIMARY KEY,
  home           VARCHAR(50) NOT NULL,
  away           VARCHAR(50) NOT NULL,
  scheduled_date DATE,
  postponed_by   VARCHAR(50),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Match results
CREATE TABLE IF NOT EXISTS matches (
  id           BIGINT PRIMARY KEY,
  uid          VARCHAR(20),
  home         VARCHAR(50) NOT NULL,
  away         VARCHAR(50) NOT NULL,
  result       VARCHAR(10) NOT NULL CHECK (result IN ('home', 'away', 'draw')),
  home_goals   INTEGER NOT NULL DEFAULT 0 CHECK (home_goals >= 0),
  away_goals   INTEGER NOT NULL DEFAULT 0 CHECK (away_goals >= 0),
  match_date   DATE NOT NULL,
  image_url    TEXT,
  image_data   TEXT,           -- base64 for uploaded screenshots
  logged_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  logged_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at    TIMESTAMPTZ,
  edited_by    INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Audit / activity log
CREATE TABLE IF NOT EXISTS audit_log (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username    VARCHAR(50),
  action      VARCHAR(100) NOT NULL,
  details     JSONB,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- App settings (key-value store)
CREATE TABLE IF NOT EXISTS settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fixtures_date ON fixtures (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_matches_date  ON matches  (match_date);
CREATE INDEX IF NOT EXISTS idx_matches_home  ON matches  (home);
CREATE INDEX IF NOT EXISTS idx_matches_away  ON matches  (away);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_log (user_id);
