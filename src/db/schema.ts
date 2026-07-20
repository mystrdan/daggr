import Database from 'better-sqlite3';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Initialize database
const dbPath = process.env.DB_PATH || './data/daggr.db';
const dbDir = path.dirname(dbPath);

// Ensure data directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db: SqliteDatabase = new Database(dbPath);

// Wallet table - stores encrypted private keys
db.exec(`
  CREATE TABLE IF NOT EXISTS Wallet (
    telegram_id TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// User table - per-user configuration
db.exec(`
  CREATE TABLE IF NOT EXISTS User (
    telegram_id TEXT PRIMARY KEY,
    active BOOLEAN DEFAULT 1,
    max_spend_per_snipe REAL DEFAULT 0.1,
    tld_tier_overrides TEXT,
    daily_spend REAL DEFAULT 0,
    daily_reset_at DATETIME,
    dry_run BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// RawEvent table - logs every detected event
db.exec(`
  CREATE TABLE IF NOT EXISTS RawEvent (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    event_type TEXT NOT NULL,
    contract_address TEXT NOT NULL,
    token_id TEXT NOT NULL,
    token_name TEXT,
    raw_data TEXT NOT NULL,
    processed BOOLEAN DEFAULT 0
  )
`);

// SnipeAttempt table - logs every snipe attempt
db.exec(`
  CREATE TABLE IF NOT EXISTS SnipeAttempt (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL,
    raw_event_id INTEGER NOT NULL,
    score REAL NOT NULL,
    action TEXT NOT NULL,
    tx_hash TEXT,
    latency_ms INTEGER,
    fee_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (telegram_id) REFERENCES Wallet(telegram_id),
    FOREIGN KEY (raw_event_id) REFERENCES RawEvent(id)
  )
`);

// Fee table - tracks collected fees
db.exec(`
  CREATE TABLE IF NOT EXISTS Fee (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL,
    tx_hash TEXT,
    amount REAL NOT NULL,
    trade_tx_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (telegram_id) REFERENCES Wallet(telegram_id)
  )
`);

// Pause state table
db.exec(`
  CREATE TABLE IF NOT EXISTS PauseState (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    paused BOOLEAN DEFAULT 0
  )
`);

// Initialize pause state
const initPause = db.prepare('INSERT OR IGNORE INTO PauseState (id, paused) VALUES (1, 0)');
initPause.run();

export default db;