import Database from 'better-sqlite3';
import { DataSource } from '../types/index.js';

export class DataSourceRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private mapRow(row: any): DataSource | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      reportId: row.report_id,
      sourceName: row.source_name,
      sourceType: row.source_type,
      referencePath: row.reference_path,
      connectionString: row.connection_string,
      server: row.server,
      databaseName: row.database_name,
    };
  }

  findByReportId(reportId: number): DataSource[] {
    const rows = this.db.prepare('SELECT * FROM data_sources WHERE report_id = ? ORDER BY source_name').all(reportId);
    return rows.map((row) => this.mapRow(row)!);
  }

  save(dataSource: DataSource): DataSource {
    const stmt = this.db.prepare(`
      INSERT INTO data_sources (report_id, source_name, source_type, reference_path, connection_string, server, database_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      dataSource.reportId,
      dataSource.sourceName,
      dataSource.sourceType,
      dataSource.referencePath,
      dataSource.connectionString,
      dataSource.server,
      dataSource.databaseName
    );
    dataSource.id = result.lastInsertRowid as number;
    return dataSource;
  }

  deleteByReportId(reportId: number): void {
    this.db.prepare('DELETE FROM data_sources WHERE report_id = ?').run(reportId);
  }
}
