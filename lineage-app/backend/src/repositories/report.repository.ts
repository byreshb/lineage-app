import Database from "better-sqlite3";
import { Report, ReportStatus, RdlSource } from "../types/index.js";
import dayjs from "dayjs";

const DATE_FORMAT = "YYYY-MM-DD HH:mm:ss";

export class ReportRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private mapRow(row: any): Report | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      fileName: row.file_name,
      filePath: row.file_path,
      reportName: row.report_name,
      source: (row.source || "FILES") as RdlSource,
      status: row.status as ReportStatus,
      starred: row.starred === 1,
      lastRunAt: row.last_run_at,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    };
  }

  findAll(source?: RdlSource): Report[] {
    if (source) {
      const rows = this.db
        .prepare("SELECT * FROM reports WHERE source = ? ORDER BY file_name")
        .all(source);
      return rows.map((row) => this.mapRow(row)!);
    }
    const rows = this.db
      .prepare("SELECT * FROM reports ORDER BY file_name")
      .all();
    return rows.map((row) => this.mapRow(row)!);
  }

  findById(id: number): Report | undefined {
    const row = this.db.prepare("SELECT * FROM reports WHERE id = ?").get(id);
    return this.mapRow(row);
  }

  findByFileName(
    fileName: string,
    source: RdlSource = "FILES",
    filePath?: string,
  ): Report | undefined {
    if (filePath) {
      const row = this.db
        .prepare(
          "SELECT * FROM reports WHERE file_name = ? AND source = ? AND file_path = ?",
        )
        .get(fileName, source, filePath);
      return this.mapRow(row);
    }
    const row = this.db
      .prepare("SELECT * FROM reports WHERE file_name = ? AND source = ?")
      .get(fileName, source);
    return this.mapRow(row);
  }

  findByFilePath(filePath: string): Report | undefined {
    const row = this.db
      .prepare("SELECT * FROM reports WHERE file_path = ?")
      .get(filePath);
    return this.mapRow(row);
  }

  findByStatus(status: ReportStatus, source?: RdlSource): Report[] {
    if (source) {
      const rows = this.db
        .prepare(
          "SELECT * FROM reports WHERE status = ? AND source = ? ORDER BY file_name",
        )
        .all(status, source);
      return rows.map((row) => this.mapRow(row)!);
    }
    const rows = this.db
      .prepare("SELECT * FROM reports WHERE status = ? ORDER BY file_name")
      .all(status);
    return rows.map((row) => this.mapRow(row)!);
  }

  save(report: Report): Report {
    if (report.id === null) {
      const stmt = this.db.prepare(`
        INSERT INTO reports (file_name, file_path, report_name, source, status, last_run_at, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        report.fileName,
        report.filePath,
        report.reportName,
        report.source || "FILES",
        report.status || "PENDING",
        report.lastRunAt,
        report.errorMessage,
      );
      report.id = result.lastInsertRowid as number;
    } else {
      const stmt = this.db.prepare(`
        UPDATE reports SET file_name = ?, file_path = ?, report_name = ?, source = ?, status = ?, last_run_at = ?, error_message = ?
        WHERE id = ?
      `);
      stmt.run(
        report.fileName,
        report.filePath,
        report.reportName,
        report.source,
        report.status,
        report.lastRunAt,
        report.errorMessage,
        report.id,
      );
    }
    return report;
  }

  updateStatus(
    id: number,
    status: ReportStatus,
    errorMessage: string | null,
  ): void {
    const lastRunAt =
      status === "COMPLETED" || status === "ERROR"
        ? dayjs().format(DATE_FORMAT)
        : null;
    this.db
      .prepare(
        `
      UPDATE reports SET status = ?, last_run_at = COALESCE(?, last_run_at), error_message = ?
      WHERE id = ?
    `,
      )
      .run(status, lastRunAt, errorMessage, id);
  }

  updateStatusByFileName(
    fileName: string,
    source: RdlSource,
    status: ReportStatus,
    errorMessage: string | null,
  ): void {
    const lastRunAt =
      status === "COMPLETED" || status === "ERROR"
        ? dayjs().format(DATE_FORMAT)
        : null;
    this.db
      .prepare(
        `
      UPDATE reports SET status = ?, last_run_at = COALESCE(?, last_run_at), error_message = ?
      WHERE file_name = ? AND source = ?
    `,
      )
      .run(status, lastRunAt, errorMessage, fileName, source);
  }

  countByStatus(status: ReportStatus, source?: RdlSource): number {
    if (source) {
      const row = this.db
        .prepare(
          "SELECT COUNT(*) as count FROM reports WHERE status = ? AND source = ?",
        )
        .get(status, source) as any;
      return row?.count || 0;
    }
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM reports WHERE status = ?")
      .get(status) as any;
    return row?.count || 0;
  }

  countAll(source?: RdlSource): number {
    if (source) {
      const row = this.db
        .prepare("SELECT COUNT(*) as count FROM reports WHERE source = ?")
        .get(source) as any;
      return row?.count || 0;
    }
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM reports")
      .get() as any;
    return row?.count || 0;
  }

  deleteById(id: number): void {
    this.db.prepare("DELETE FROM reports WHERE id = ?").run(id);
  }

  toggleStar(id: number): boolean {
    // Toggle starred status and return new value
    const report = this.findById(id);
    if (!report) return false;
    const newStarred = report.starred ? 0 : 1;
    this.db
      .prepare("UPDATE reports SET starred = ? WHERE id = ?")
      .run(newStarred, id);
    return newStarred === 1;
  }

  findStarred(source?: RdlSource): Report[] {
    if (source) {
      const rows = this.db
        .prepare(
          "SELECT * FROM reports WHERE starred = 1 AND source = ? ORDER BY file_name",
        )
        .all(source);
      return rows.map((row) => this.mapRow(row)!);
    }
    const rows = this.db
      .prepare("SELECT * FROM reports WHERE starred = 1 ORDER BY file_name")
      .all();
    return rows.map((row) => this.mapRow(row)!);
  }

  countStarred(source?: RdlSource): number {
    if (source) {
      const row = this.db
        .prepare(
          "SELECT COUNT(*) as count FROM reports WHERE starred = 1 AND source = ?",
        )
        .get(source) as any;
      return row?.count || 0;
    }
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM reports WHERE starred = 1")
      .get() as any;
    return row?.count || 0;
  }
}
