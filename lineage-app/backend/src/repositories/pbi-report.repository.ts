import Database from 'better-sqlite3';

export interface PbiReport {
  id: number | null;
  reportName: string;
  starred: boolean;
  createdAt?: string;
}

export class PbiReportRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private mapRow(row: any): PbiReport | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      reportName: row.report_name,
      starred: row.starred === 1,
      createdAt: row.created_at,
    };
  }

  findAll(): PbiReport[] {
    const rows = this.db.prepare('SELECT * FROM pbi_reports ORDER BY report_name').all();
    return rows.map((row) => this.mapRow(row)!);
  }

  findById(id: number): PbiReport | undefined {
    const row = this.db.prepare('SELECT * FROM pbi_reports WHERE id = ?').get(id);
    return this.mapRow(row);
  }

  findByName(reportName: string): PbiReport | undefined {
    const row = this.db.prepare('SELECT * FROM pbi_reports WHERE report_name = ?').get(reportName);
    return this.mapRow(row);
  }

  create(reportName: string): PbiReport {
    const stmt = this.db.prepare('INSERT INTO pbi_reports (report_name) VALUES (?)');
    const result = stmt.run(reportName);
    return {
      id: result.lastInsertRowid as number,
      reportName,
      starred: false,
    };
  }

  findOrCreate(reportName: string): PbiReport {
    const existing = this.findByName(reportName);
    if (existing) return existing;
    return this.create(reportName);
  }

  countAll(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM pbi_reports').get() as any;
    return row?.count || 0;
  }

  clear(): void {
    this.db.prepare('DELETE FROM pbi_reports').run();
  }

  toggleStar(id: number): boolean {
    const report = this.findById(id);
    if (!report) return false;
    const newStarred = report.starred ? 0 : 1;
    this.db.prepare('UPDATE pbi_reports SET starred = ? WHERE id = ?').run(newStarred, id);
    return newStarred === 1;
  }

  findStarred(): PbiReport[] {
    const rows = this.db.prepare('SELECT * FROM pbi_reports WHERE starred = 1 ORDER BY report_name').all();
    return rows.map((row) => this.mapRow(row)!);
  }

  countStarred(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM pbi_reports WHERE starred = 1').get() as any;
    return row?.count || 0;
  }
}
