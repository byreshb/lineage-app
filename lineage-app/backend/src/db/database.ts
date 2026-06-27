import Database from "better-sqlite3";
import fs from "fs";
import { resolvedPaths } from "../config/index.js";

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(resolvedPaths.database);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initializeSchema();
  }
  return db;
}

function initializeSchema(): void {
  if (!db) return;

  const schemaPath = resolvedPaths.schemaFile;
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, "utf-8");
    db.exec(schema);
    console.log("Database schema initialized");

    // Run migrations for existing databases
    runMigrations();
  } else {
    console.warn("Schema file not found:", schemaPath);
  }
}

function runMigrations(): void {
  if (!db) return;

  // Add starred column to reports table if it doesn't exist
  try {
    const columns = db.prepare("PRAGMA table_info(reports)").all() as {
      name: string;
    }[];
    const hasStarred = columns.some((col) => col.name === "starred");
    if (!hasStarred) {
      db.exec("ALTER TABLE reports ADD COLUMN starred INTEGER DEFAULT 0");
      console.log("Migration: Added starred column to reports table");
    }
  } catch (err) {
    console.warn("Migration warning (reports):", err);
  }

  // Add starred column to linked_reports table if it doesn't exist
  try {
    const columns = db.prepare("PRAGMA table_info(linked_reports)").all() as {
      name: string;
    }[];
    const hasStarred = columns.some((col) => col.name === "starred");
    if (!hasStarred) {
      db.exec(
        "ALTER TABLE linked_reports ADD COLUMN starred INTEGER DEFAULT 0",
      );
      console.log("Migration: Added starred column to linked_reports table");
    }
  } catch (err) {
    console.warn("Migration warning (linked_reports):", err);
  }

  // Add starred column to pbi_reports table if it doesn't exist
  try {
    const columns = db.prepare("PRAGMA table_info(pbi_reports)").all() as {
      name: string;
    }[];
    const hasStarred = columns.some((col) => col.name === "starred");
    if (!hasStarred) {
      db.exec("ALTER TABLE pbi_reports ADD COLUMN starred INTEGER DEFAULT 0");
      console.log("Migration: Added starred column to pbi_reports table");
    }
  } catch (err) {
    console.warn("Migration warning (pbi_reports):", err);
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
