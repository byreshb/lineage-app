import Database from 'better-sqlite3';
import { SourceTable, SourceType } from '../types/index.js';

export class TableRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private mapRow(row: any): SourceTable | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      server: row.server,
      databaseName: row.database_name,
      schemaName: row.schema_name,
      tableName: row.table_name,
      hasPk: row.has_pk === 1 ? true : row.has_pk === 0 ? false : null,
      sourceType: row.source_type as SourceType | null,
    };
  }

  findAll(): SourceTable[] {
    const rows = this.db.prepare('SELECT * FROM source_tables ORDER BY server, database_name, schema_name, table_name').all();
    return rows.map((row) => this.mapRow(row)!);
  }

  findById(id: number): SourceTable | undefined {
    const row = this.db.prepare('SELECT * FROM source_tables WHERE id = ?').get(id);
    return this.mapRow(row);
  }

  findByName(tableName: string): SourceTable | undefined {
    // Handle schema-prefixed names like "dbo.DateDim"
    if (tableName.includes('.')) {
      const parts = tableName.split('.');
      const schema = parts[0];
      const name = parts.slice(1).join('.');
      const row = this.db.prepare('SELECT * FROM source_tables WHERE schema_name = ? AND table_name = ?').get(schema, name);
      if (row) return this.mapRow(row);
    }
    // Also try exact match on table_name only
    const row = this.db.prepare('SELECT * FROM source_tables WHERE table_name = ?').get(tableName);
    return this.mapRow(row);
  }

  findBySchemaAndName(schemaName: string, tableName: string): SourceTable | undefined {
    const row = this.db.prepare('SELECT * FROM source_tables WHERE schema_name = ? AND table_name = ?').get(schemaName, tableName);
    return this.mapRow(row);
  }

  findByFullName(server: string, databaseName: string, schemaName: string, tableName: string): SourceTable | undefined {
    const row = this.db.prepare('SELECT * FROM source_tables WHERE server = ? AND database_name = ? AND schema_name = ? AND table_name = ?')
      .get(server, databaseName, schemaName, tableName);
    return this.mapRow(row);
  }

  findByNameLike(pattern: string): SourceTable[] {
    const rows = this.db.prepare('SELECT * FROM source_tables WHERE table_name LIKE ?').all(`%${pattern}%`);
    return rows.map((row) => this.mapRow(row)!);
  }

  // Find all schemas where a table exists (for tables referenced without schema)
  findAllSchemasForTable(tableName: string): string[] {
    const rows = this.db.prepare(
      'SELECT DISTINCT schema_name FROM source_tables WHERE table_name = ? ORDER BY schema_name'
    ).all(tableName) as { schema_name: string }[];
    return rows.map(r => r.schema_name);
  }

  findByServer(server: string): SourceTable[] {
    const rows = this.db.prepare('SELECT * FROM source_tables WHERE server = ?').all(server);
    return rows.map((row) => this.mapRow(row)!);
  }

  save(table: SourceTable): SourceTable {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO source_tables (server, database_name, schema_name, table_name, has_pk, source_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      table.server,
      table.databaseName,
      table.schemaName,
      table.tableName,
      table.hasPk === null ? null : table.hasPk ? 1 : 0,
      table.sourceType
    );
    if (table.id === null) {
      table.id = result.lastInsertRowid as number;
    }
    return table;
  }

  saveAll(tables: SourceTable[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO source_tables (server, database_name, schema_name, table_name, has_pk, source_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertMany = this.db.transaction((items: SourceTable[]) => {
      for (const table of items) {
        stmt.run(
          table.server,
          table.databaseName,
          table.schemaName,
          table.tableName,
          table.hasPk === null ? null : table.hasPk ? 1 : 0,
          table.sourceType
        );
      }
    });
    insertMany(tables);
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM source_tables').get() as any;
    return row?.count || 0;
  }

  deleteAll(): void {
    this.db.prepare('DELETE FROM source_tables').run();
  }

  /**
   * Find custom tables (tables ending with '+') that are referenced by starred reports.
   * Joins through lineage table to find tables connected to starred reports.
   * Returns unique tables with report association info.
   */
  findCustomTablesFromStarredReports(): Array<{
    reportId: number;
    reportName: string;
    reportPath: string;
    server: string;
    databaseName: string;
    schemaName: string;
    tableName: string;
    hasPk: boolean | null;
  }> {
    const rows = this.db.prepare(`
      SELECT DISTINCT
        r.id as report_id,
        COALESCE(r.report_name, r.file_name) as report_name,
        r.file_path as report_path,
        st.server,
        st.database_name,
        st.schema_name,
        st.table_name,
        st.has_pk
      FROM reports r
      INNER JOIN lineage l ON l.report_id = r.id
      INNER JOIN source_tables st ON st.id = l.target_id
      WHERE r.starred = 1
        AND r.status = 'COMPLETED'
        AND l.target_type = 'TABLE'
        AND st.table_name LIKE '%+'
      ORDER BY r.report_name, st.table_name
    `).all() as any[];

    return rows.map(row => ({
      reportId: row.report_id,
      reportName: row.report_name,
      reportPath: row.report_path || '',
      server: row.server || '',
      databaseName: row.database_name || '',
      schemaName: row.schema_name || '',
      tableName: row.table_name,
      hasPk: row.has_pk === 1 ? true : row.has_pk === 0 ? false : null,
    }));
  }
}
