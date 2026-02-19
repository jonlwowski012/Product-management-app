import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', 'data.db');

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'pm',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    owner_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS features (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    feature_type TEXT NOT NULL DEFAULT 'model',
    priority TEXT NOT NULL DEFAULT 'medium',
    current_phase INTEGER NOT NULL DEFAULT 1,
    priority_score REAL,
    story_points INTEGER,
    due_date TEXT,
    assignee_id TEXT REFERENCES users(id),
    reporter_id TEXT REFERENCES users(id),
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS phase_data (
    id TEXT PRIMARY KEY,
    feature_id TEXT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    phase_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started',
    data TEXT NOT NULL DEFAULT '{}',
    completed_at TEXT,
    completed_by TEXT REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    feature_id TEXT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    phase_number INTEGER,
    user_id TEXT NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6'
  );

  CREATE TABLE IF NOT EXISTS feature_tags (
    feature_id TEXT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (feature_id, tag_id)
  );
`);

// Migrate existing databases: add new columns if they don't exist
// SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN,
// so we wrap each in a try/catch
const migrations = [
  `ALTER TABLE features ADD COLUMN feature_type TEXT NOT NULL DEFAULT 'model'`,
  `ALTER TABLE features ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'`,
  `ALTER TABLE features ADD COLUMN story_points INTEGER`,
  `ALTER TABLE features ADD COLUMN due_date TEXT`,
  `ALTER TABLE features ADD COLUMN reporter_id TEXT REFERENCES users(id)`,
];

for (const migration of migrations) {
  try {
    sqlite.exec(migration);
  } catch {
    // Column already exists — ignore
  }
}
