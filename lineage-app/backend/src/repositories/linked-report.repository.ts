import Database from "better-sqlite3";
import { LinkedReport } from "../types/index.js";

export class LinkedReportRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private mapRow(row: any): LinkedReport | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      linkedReportName: row.linked_report_name,
      linkedReportPath: row.linked_report_path,
      templatePath: row.template_path,
      starred: row.starred === 1,
    };
  }

  findAll(): LinkedReport[] {
    const rows = this.db
      .prepare("SELECT * FROM linked_reports ORDER BY linked_report_path")
      .all();
    return rows.map((row) => this.mapRow(row)!);
  }

  findById(id: number): LinkedReport | undefined {
    const row = this.db
      .prepare("SELECT * FROM linked_reports WHERE id = ?")
      .get(id);
    return this.mapRow(row);
  }

  findByLinkedName(name: string): LinkedReport | undefined {
    const row = this.db
      .prepare("SELECT * FROM linked_reports WHERE linked_report_name = ?")
      .get(name);
    return this.mapRow(row);
  }

  findByLinkedPath(path: string): LinkedReport | undefined {
    const row = this.db
      .prepare("SELECT * FROM linked_reports WHERE linked_report_path = ?")
      .get(path);
    return this.mapRow(row);
  }

  findByTemplatePath(templatePath: string): LinkedReport[] {
    const rows = this.db
      .prepare("SELECT * FROM linked_reports WHERE template_path = ?")
      .all(templatePath);
    return rows.map((row) => this.mapRow(row)!);
  }

  searchByName(searchTerm: string): LinkedReport[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM linked_reports WHERE linked_report_name LIKE ? OR linked_report_path LIKE ? ORDER BY linked_report_path",
      )
      .all(`%${searchTerm}%`, `%${searchTerm}%`);
    return rows.map((row) => this.mapRow(row)!);
  }

  save(linkedReport: LinkedReport): LinkedReport {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO linked_reports
      (linked_report_name, linked_report_path, template_path)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(
      linkedReport.linkedReportName,
      linkedReport.linkedReportPath,
      linkedReport.templatePath,
    );
    if (linkedReport.id === null) {
      linkedReport.id = result.lastInsertRowid as number;
    }
    return linkedReport;
  }

  saveAll(linkedReports: LinkedReport[]): void {
    // Use INSERT OR IGNORE to not overwrite existing records (preserves starred status)
    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO linked_reports
      (linked_report_name, linked_report_path, template_path, starred)
      VALUES (?, ?, ?, 0)
    `);
    // Update template_path for existing records (in case it changed), but preserve starred
    const updateStmt = this.db.prepare(`
      UPDATE linked_reports SET linked_report_name = ?, template_path = ?
      WHERE linked_report_path = ?
    `);
    const insertMany = this.db.transaction((items: LinkedReport[]) => {
      for (const lr of items) {
        insertStmt.run(
          lr.linkedReportName,
          lr.linkedReportPath,
          lr.templatePath,
        );
        updateStmt.run(
          lr.linkedReportName,
          lr.templatePath,
          lr.linkedReportPath,
        );
      }
    });
    insertMany(linkedReports);
  }

  count(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM linked_reports")
      .get() as any;
    return row?.count || 0;
  }

  deleteAll(): void {
    this.db.prepare("DELETE FROM linked_reports").run();
  }

  toggleStar(id: number): boolean {
    const report = this.findById(id);
    if (!report) return false;
    const newStarred = report.starred ? 0 : 1;
    this.db
      .prepare("UPDATE linked_reports SET starred = ? WHERE id = ?")
      .run(newStarred, id);
    return newStarred === 1;
  }

  findStarred(): LinkedReport[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM linked_reports WHERE starred = 1 ORDER BY linked_report_path",
      )
      .all();
    return rows.map((row) => this.mapRow(row)!);
  }

  countStarred(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM linked_reports WHERE starred = 1")
      .get() as any;
    return row?.count || 0;
  }
}
