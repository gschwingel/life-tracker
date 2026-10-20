import initSqlJs, { type Database } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { loadDbBytes, saveDbBytes } from './idb';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS daily_logs (
  id TEXT PRIMARY KEY,
  dia TEXT NOT NULL,
  domain TEXT NOT NULL,
  value REAL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (dia, domain)
);

CREATE TABLE IF NOT EXISTS cardio_logs (
  id TEXT PRIMARY KEY,
  dia TEXT NOT NULL,
  tipo TEXT NOT NULL,
  minutos INTEGER,
  distancia_km REAL,
  intensidade INTEGER,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (dia)
);

CREATE TABLE IF NOT EXISTS invest_transactions (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  tipo TEXT NOT NULL,
  ticker TEXT,
  valor REAL NOT NULL,
  quantidade REAL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portfolio_positions (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  quantidade REAL NOT NULL,
  preco_medio REAL NOT NULL,
  atualizado_em TEXT NOT NULL,
  UNIQUE (ticker)
);
`;

let db: Database | null = null;
let persistTimer: number | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const bytes = await loadDbBytes();
  db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  db.run(SCHEMA);
  return db;
}

export function persist(): void {
  if (persistTimer) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(async () => {
    if (db) await saveDbBytes(db.export());
  }, 300);
}