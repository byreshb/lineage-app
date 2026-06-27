import Database from "better-sqlite3";
import { StoredProcedure } from "../types/index.js";

export class StoredProcRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private mapRow(row: any): StoredProcedure | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      schemaName: row.schema_name,
      procName: row.proc_name,
      definition: row.definition,
    };
  }

  findAll(): StoredProcedure[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM stored_procedures ORDER BY schema_name, proc_name",
      )
      .all();
    return rows.map((row) => this.mapRow(row)!);
  }

  findById(id: number): StoredProcedure | undefined {
    const row = this.db
      .prepare("SELECT * FROM stored_procedures WHERE id = ?")
      .get(id);
    return this.mapRow(row);
  }

  findByName(procName: string): StoredProcedure | undefined {
    const row = this.db
      .prepare("SELECT * FROM stored_procedures WHERE proc_name = ?")
      .get(procName);
    return this.mapRow(row);
  }

  findBySchemaAndName(
    schemaName: string,
    procName: string,
  ): StoredProcedure | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM stored_procedures WHERE schema_name = ? AND proc_name = ?",
      )
      .get(schemaName, procName);
    return this.mapRow(row);
  }

  findByNameLike(pattern: string): StoredProcedure[] {
    const rows = this.db
      .prepare("SELECT * FROM stored_procedures WHERE proc_name LIKE ?")
      .all(`%${pattern}%`);
    return rows.map((row) => this.mapRow(row)!);
  }

  save(proc: StoredProcedure): StoredProcedure {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO stored_procedures (schema_name, proc_name, definition)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(proc.schemaName, proc.procName, proc.definition);
    if (proc.id === null) {
      proc.id = result.lastInsertRowid as number;
    }
    return proc;
  }

  saveAll(procs: StoredProcedure[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO stored_procedures (schema_name, proc_name, definition)
      VALUES (?, ?, ?)
    `);
    const insertMany = this.db.transaction((items: StoredProcedure[]) => {
      for (const proc of items) {
        stmt.run(proc.schemaName, proc.procName, proc.definition);
      }
    });
    insertMany(procs);
  }

  count(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM stored_procedures")
      .get() as any;
    return row?.count || 0;
  }

  deleteAll(): void {
    this.db.prepare("DELETE FROM stored_procedures").run();
  }
}
