import Database from 'better-sqlite3';

export interface PbiTable {
  id: number | null;
  pbiReportId: number;
  tableName: string;
  sourceDatabase: string | null;
  sourceViewOrTable: string | null;
}

export class PbiTableRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private mapRow(row: any): PbiTable | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      pbiReportId: row.pbi_report_id,
      tableName: row.table_name,
      sourceDatabase: row.source_database,
      sourceViewOrTable: row.source_view_or_table,
    };
  }

  findByReportId(pbiReportId: number): PbiTable[] {
    const rows = this.db.prepare(
      'SELECT * FROM pbi_tables WHERE pbi_report_id = ? ORDER BY table_name'
    ).all(pbiReportId);
    return rows.map((row) => this.mapRow(row)!);
  }

  findById(id: number): PbiTable | undefined {
    const row = this.db.prepare('SELECT * FROM pbi_tables WHERE id = ?').get(id);
    return this.mapRow(row);
  }

  create(table: Omit<PbiTable, 'id'>): PbiTable {
    const stmt = this.db.prepare(`
      INSERT INTO pbi_tables (pbi_report_id, table_name, source_database, source_view_or_table)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(
      table.pbiReportId,
      table.tableName,
      table.sourceDatabase,
      table.sourceViewOrTable
    );
    return {
      id: result.lastInsertRowid as number,
      ...table,
    };
  }

  clearByReportId(pbiReportId: number): void {
    this.db.prepare('DELETE FROM pbi_tables WHERE pbi_report_id = ?').run(pbiReportId);
  }

  clear(): void {
    this.db.prepare('DELETE FROM pbi_tables').run();
  }

  countAll(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM pbi_tables').get() as any;
    return row?.count || 0;
  }
}
