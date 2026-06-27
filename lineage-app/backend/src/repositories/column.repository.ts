import Database from "better-sqlite3";
import { Sql2Column, Trn1Column } from "../types/index.js";

export class ColumnRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // SQL2 Column methods
  private mapSql2Row(row: any): Sql2Column | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      databaseName: row.database_name,
      schemaName: row.schema_name,
      tableName: row.table_name,
      columnName: row.column_name,
      dataType: row.data_type,
      maxLength: row.max_length,
      precision: row.precision,
      scale: row.scale,
      isNullable:
        row.is_nullable === 1 ? true : row.is_nullable === 0 ? false : null,
      isPrimaryKey:
        row.is_primary_key === 1
          ? true
          : row.is_primary_key === 0
            ? false
            : null,
    };
  }

  findSql2ColumnsByTable(tableName: string, schemaName?: string): Sql2Column[] {
    let query: string;
    let params: any[];

    if (schemaName) {
      query =
        "SELECT * FROM sql2_columns WHERE schema_name = ? AND table_name = ? ORDER BY id";
      params = [schemaName, tableName];
    } else {
      query = "SELECT * FROM sql2_columns WHERE table_name = ? ORDER BY id";
      params = [tableName];
    }

    const rows = this.db.prepare(query).all(...params);
    return rows.map((row) => this.mapSql2Row(row)!);
  }

  saveSql2Column(column: Sql2Column): Sql2Column {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sql2_columns
      (database_name, schema_name, table_name, column_name, data_type, max_length, precision, scale, is_nullable, is_primary_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      column.databaseName,
      column.schemaName,
      column.tableName,
      column.columnName,
      column.dataType,
      column.maxLength,
      column.precision,
      column.scale,
      column.isNullable === null ? null : column.isNullable ? 1 : 0,
      column.isPrimaryKey === null ? null : column.isPrimaryKey ? 1 : 0,
    );
    if (column.id === null) {
      column.id = result.lastInsertRowid as number;
    }
    return column;
  }

  saveAllSql2(columns: Sql2Column[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sql2_columns
      (database_name, schema_name, table_name, column_name, data_type, max_length, precision, scale, is_nullable, is_primary_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = this.db.transaction((items: Sql2Column[]) => {
      for (const col of items) {
        stmt.run(
          col.databaseName,
          col.schemaName,
          col.tableName,
          col.columnName,
          col.dataType,
          col.maxLength,
          col.precision,
          col.scale,
          col.isNullable === null ? null : col.isNullable ? 1 : 0,
          col.isPrimaryKey === null ? null : col.isPrimaryKey ? 1 : 0,
        );
      }
    });
    insertMany(columns);
  }

  deleteAllSql2(): void {
    this.db.prepare("DELETE FROM sql2_columns").run();
  }

  countSql2(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM sql2_columns")
      .get() as any;
    return row?.count || 0;
  }

  // TRN1 Column methods
  private mapTrn1Row(row: any): Trn1Column | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      server: row.server,
      databaseName: row.database_name,
      schemaName: row.schema_name,
      objectName: row.object_name,
      columnName: row.column_name,
      dataType: row.data_type,
      maxLength: row.max_length,
      precision: row.precision,
      scale: row.scale,
      isNullable:
        row.is_nullable === 1 ? true : row.is_nullable === 0 ? false : null,
    };
  }

  findTrn1ColumnsByObject(
    objectName: string,
    schemaName?: string,
  ): Trn1Column[] {
    let query: string;
    let params: any[];

    if (schemaName) {
      query =
        "SELECT * FROM trn1_columns WHERE schema_name = ? AND object_name = ? ORDER BY id";
      params = [schemaName, objectName];
    } else {
      query = "SELECT * FROM trn1_columns WHERE object_name = ? ORDER BY id";
      params = [objectName];
    }

    const rows = this.db.prepare(query).all(...params);
    return rows.map((row) => this.mapTrn1Row(row)!);
  }

  saveTrn1Column(column: Trn1Column): Trn1Column {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO trn1_columns
      (server, database_name, schema_name, object_name, column_name, data_type, max_length, precision, scale, is_nullable)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      column.server,
      column.databaseName,
      column.schemaName,
      column.objectName,
      column.columnName,
      column.dataType,
      column.maxLength,
      column.precision,
      column.scale,
      column.isNullable === null ? null : column.isNullable ? 1 : 0,
    );
    if (column.id === null) {
      column.id = result.lastInsertRowid as number;
    }
    return column;
  }

  saveAllTrn1(columns: Trn1Column[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO trn1_columns
      (server, database_name, schema_name, object_name, column_name, data_type, max_length, precision, scale, is_nullable)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = this.db.transaction((items: Trn1Column[]) => {
      for (const col of items) {
        stmt.run(
          col.server,
          col.databaseName,
          col.schemaName,
          col.objectName,
          col.columnName,
          col.dataType,
          col.maxLength,
          col.precision,
          col.scale,
          col.isNullable === null ? null : col.isNullable ? 1 : 0,
        );
      }
    });
    insertMany(columns);
  }

  deleteAllTrn1(): void {
    this.db.prepare("DELETE FROM trn1_columns").run();
  }

  countTrn1(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM trn1_columns")
      .get() as any;
    return row?.count || 0;
  }
}
