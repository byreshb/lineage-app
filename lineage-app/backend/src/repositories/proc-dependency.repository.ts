import Database from "better-sqlite3";
import { ProcDependency } from "../types/index.js";

export class ProcDependencyRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private mapRow(row: any): ProcDependency | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      objectSchema: row.object_schema,
      objectName: row.object_name,
      objectType: row.object_type,
      dependsOnSchema: row.depends_on_schema,
      dependsOnName: row.depends_on_name,
      dependsOnType: row.depends_on_type,
    };
  }

  findByObject(schema: string, name: string): ProcDependency[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM proc_dependencies WHERE object_schema = ? AND object_name = ? AND depends_on_name IS NOT NULL",
      )
      .all(schema, name);
    return rows.map((row) => this.mapRow(row)!);
  }

  findByObjectName(name: string): ProcDependency[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM proc_dependencies WHERE LOWER(object_name) = LOWER(?) AND depends_on_name IS NOT NULL",
      )
      .all(name);
    return rows.map((row) => this.mapRow(row)!);
  }

  dependencyExists(
    objectSchema: string,
    objectName: string,
    dependsOnSchema: string,
    dependsOnName: string,
  ): boolean {
    const row = this.db
      .prepare(
        `
      SELECT COUNT(*) as count FROM proc_dependencies WHERE
      LOWER(object_schema) = LOWER(?) AND LOWER(object_name) = LOWER(?) AND
      LOWER(depends_on_schema) = LOWER(?) AND LOWER(depends_on_name) = LOWER(?)
    `,
      )
      .get(objectSchema, objectName, dependsOnSchema, dependsOnName) as any;
    return (row?.count || 0) > 0;
  }

  dependencyExistsByName(objectName: string, dependsOnName: string): boolean {
    const row = this.db
      .prepare(
        `
      SELECT COUNT(*) as count FROM proc_dependencies WHERE
      LOWER(object_name) = LOWER(?) AND LOWER(depends_on_name) = LOWER(?)
    `,
      )
      .get(objectName, dependsOnName) as any;
    return (row?.count || 0) > 0;
  }

  save(dep: ProcDependency): void {
    this.db
      .prepare(
        `
      INSERT INTO proc_dependencies (object_schema, object_name, object_type, depends_on_schema, depends_on_name, depends_on_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        dep.objectSchema,
        dep.objectName,
        dep.objectType,
        dep.dependsOnSchema,
        dep.dependsOnName,
        dep.dependsOnType,
      );
  }

  saveAll(deps: ProcDependency[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO proc_dependencies (object_schema, object_name, object_type, depends_on_schema, depends_on_name, depends_on_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertMany = this.db.transaction((items: ProcDependency[]) => {
      for (const dep of items) {
        stmt.run(
          dep.objectSchema,
          dep.objectName,
          dep.objectType,
          dep.dependsOnSchema,
          dep.dependsOnName,
          dep.dependsOnType,
        );
      }
    });
    insertMany(deps);
  }

  count(): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) as count FROM proc_dependencies WHERE depends_on_name IS NOT NULL",
      )
      .get() as any;
    return row?.count || 0;
  }

  deleteAll(): void {
    this.db.prepare("DELETE FROM proc_dependencies").run();
  }
}
