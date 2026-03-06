import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { logger } from './logger';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dbDir = path.dirname(config.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    logger.info('SQLite database initialized', { path: config.dbPath });
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS datasets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id TEXT UNIQUE NOT NULL,
      manifest_tx_hash TEXT,
      creator_address TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      content_type TEXT,
      file_size INTEGER,
      chunk_count INTEGER,
      price_wei TEXT,
      license_type TEXT,
      file_hash TEXT,
      payload_hash TEXT,
      created_at INTEGER NOT NULL,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id TEXT NOT NULL,
      buyer_address TEXT NOT NULL,
      receipt_tx_hash TEXT,
      amount_wei TEXT,
      tx_hash TEXT,
      purchased_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blob_jobs (
      job_id TEXT PRIMARY KEY,
      blob_tx_hash TEXT,
      status TEXT NOT NULL,
      dataset_id TEXT,
      job_type TEXT,
      created_at INTEGER NOT NULL,
      confirmed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_datasets_creator ON datasets(creator_address);
    CREATE INDEX IF NOT EXISTS idx_purchases_dataset ON purchases(dataset_id);
    CREATE INDEX IF NOT EXISTS idx_purchases_buyer ON purchases(buyer_address);
    CREATE INDEX IF NOT EXISTS idx_blob_jobs_dataset ON blob_jobs(dataset_id);
  `);
}