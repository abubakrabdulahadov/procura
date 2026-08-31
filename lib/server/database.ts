import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDirectory = path.join(process.cwd(), ".data");

let instance: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (instance) return instance;
  mkdirSync(dataDirectory, { recursive: true });
  const database = new DatabaseSync(path.join(dataDirectory, "procura.db"));
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 3000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS carts (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      quantities_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_proposals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      proposal_json TEXT NOT NULL,
      status TEXT NOT NULL,
      approval_token TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      proposal_id TEXT NOT NULL UNIQUE,
      order_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS orders_user_created_idx ON orders(user_id, created_at DESC);
  `);
  instance = database;
  return database;
}
