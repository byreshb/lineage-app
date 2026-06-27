import Database from "better-sqlite3";
import { Trn1Schema } from "../types/index.js";

export class Trn1SchemaRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private mapRow(row: any): Trn1Schema | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      server: row.server,
      databaseName: row.database_name,
      schemaName: row.schema_name,
      objectName: row.object_name,
      objectType: row.object_type,
    };
  }

  findAll(): Trn1Schema[] {
    const rows = this.db
      .prepare("SELECT * FROM trn1_schema ORDER BY schema_name, object_name")
      .all();
    return rows.map((row) => this.mapRow(row)!);
  }

  findById(id: number): Trn1Schema | undefined {
    const row = this.db
      .prepare("SELECT * FROM trn1_schema WHERE id = ?")
      .get(id);
    return this.mapRow(row);
  }

  /**
   * Find by object name (case-insensitive)
   * Returns the first match if multiple schemas contain the same object name
   */
  findByObjectName(objectName: string): Trn1Schema | undefined {
    // Try exact match first
    const row = this.db
      .prepare(
        "SELECT * FROM trn1_schema WHERE object_name = ? COLLATE NOCASE LIMIT 1",
      )
      .get(objectName);
    return this.mapRow(row);
  }

  /**
   * Find by schema and object name (case-insensitive)
   */
  findBySchemaAndName(
    schemaName: string,
    objectName: string,
  ): Trn1Schema | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM trn1_schema WHERE schema_name = ? COLLATE NOCASE AND object_name = ? COLLATE NOCASE LIMIT 1",
      )
      .get(schemaName, objectName);
    return this.mapRow(row);
  }

  /**
   * Check if an object exists in TRN1
   */
  exists(objectName: string): boolean {
    const row = this.db
      .prepare(
        "SELECT 1 FROM trn1_schema WHERE object_name = ? COLLATE NOCASE LIMIT 1",
      )
      .get(objectName);
    return !!row;
  }

  /**
   * Check if an object exists with specific schema in TRN1
   */
  existsWithSchema(schemaName: string, objectName: string): boolean {
    const row = this.db
      .prepare(
        "SELECT 1 FROM trn1_schema WHERE schema_name = ? COLLATE NOCASE AND object_name = ? COLLATE NOCASE LIMIT 1",
      )
      .get(schemaName, objectName);
    return !!row;
  }

  saveAll(items: Trn1Schema[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO trn1_schema (server, database_name, schema_name, object_name, object_type)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertMany = this.db.transaction((schemas: Trn1Schema[]) => {
      for (const item of schemas) {
        stmt.run(
          item.server,
          item.databaseName,
          item.schemaName,
          item.objectName,
          item.objectType,
        );
      }
    });
    insertMany(items);
  }

  count(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM trn1_schema")
      .get() as any;
    return row?.count || 0;
  }

  deleteAll(): void {
    this.db.prepare("DELETE FROM trn1_schema").run();
  }
}
