import Database from "better-sqlite3";
import { View } from "../types/index.js";

export class ViewRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private mapRow(row: any): View | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      databaseName: row.database_name,
      schemaName: row.schema_name,
      viewName: row.view_name,
      definition: row.definition,
    };
  }

  findAll(): View[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM views ORDER BY database_name, schema_name, view_name",
      )
      .all();
    return rows.map((row) => this.mapRow(row)!);
  }

  findById(id: number): View | undefined {
    const row = this.db.prepare("SELECT * FROM views WHERE id = ?").get(id);
    return this.mapRow(row);
  }

  findByName(viewName: string): View | undefined {
    // Handle schema-prefixed names like "bi.vInvBalances"
    if (viewName.includes(".")) {
      const parts = viewName.split(".");
      const schema = parts[0];
      const name = parts.slice(1).join("."); // Handle edge cases with multiple dots
      const row = this.db
        .prepare("SELECT * FROM views WHERE schema_name = ? AND view_name = ?")
        .get(schema, name);
      if (row) return this.mapRow(row);
    }
    // Also try exact match on view_name only
    const row = this.db
      .prepare("SELECT * FROM views WHERE view_name = ?")
      .get(viewName);
    return this.mapRow(row);
  }

  findBySchemaAndName(schemaName: string, viewName: string): View | undefined {
    const row = this.db
      .prepare("SELECT * FROM views WHERE schema_name = ? AND view_name = ?")
      .get(schemaName, viewName);
    return this.mapRow(row);
  }

  findByNameLike(pattern: string): View[] {
    const rows = this.db
      .prepare("SELECT * FROM views WHERE view_name LIKE ?")
      .all(`%${pattern}%`);
    return rows.map((row) => this.mapRow(row)!);
  }

  save(view: View): View {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO views (database_name, schema_name, view_name, definition)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(
      view.databaseName,
      view.schemaName,
      view.viewName,
      view.definition,
    );
    if (view.id === null) {
      view.id = result.lastInsertRowid as number;
    }
    return view;
  }

  saveAll(views: View[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO views (database_name, schema_name, view_name, definition)
      VALUES (?, ?, ?, ?)
    `);
    const insertMany = this.db.transaction((items: View[]) => {
      for (const view of items) {
        stmt.run(
          view.databaseName,
          view.schemaName,
          view.viewName,
          view.definition,
        );
      }
    });
    insertMany(views);
  }

  count(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM views")
      .get() as any;
    return row?.count || 0;
  }

  deleteAll(): void {
    this.db.prepare("DELETE FROM views").run();
  }
}
