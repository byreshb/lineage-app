import Database from 'better-sqlite3';
import { ReportExecution } from '../types/index.js';

export class ReportExecutionRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private mapRow(row: any): ReportExecution | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      reportPath: row.report_path,
      executedAt: row.executed_at,
      status: row.status,
      requestType: row.request_type,
      userName: row.user_name,
      parameters: row.parameters,
    };
  }

  findById(id: number): ReportExecution | undefined {
    const row = this.db.prepare('SELECT * FROM report_executions WHERE id = ?').get(id);
    return this.mapRow(row);
  }

  findByPath(path: string): ReportExecution[] {
    const rows = this.db.prepare(
      'SELECT * FROM report_executions WHERE report_path = ? ORDER BY executed_at DESC'
    ).all(path);
    return rows.map((row) => this.mapRow(row)!);
  }

  findByPathLimited(path: string, limit: number = 10): ReportExecution[] {
    const rows = this.db.prepare(
      'SELECT * FROM report_executions WHERE report_path = ? ORDER BY executed_at DESC LIMIT ?'
    ).all(path, limit);
    return rows.map((row) => this.mapRow(row)!);
  }

  findAll(): ReportExecution[] {
    const rows = this.db.prepare('SELECT * FROM report_executions ORDER BY executed_at DESC').all();
    return rows.map((row) => this.mapRow(row)!);
  }

  save(execution: ReportExecution): ReportExecution {
    const stmt = this.db.prepare(`
      INSERT INTO report_executions
      (report_path, executed_at, status, request_type, user_name, parameters)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      execution.reportPath,
      execution.executedAt,
      execution.status,
      execution.requestType,
      execution.userName,
      execution.parameters
    );
    if (execution.id === null) {
      execution.id = result.lastInsertRowid as number;
    }
    return execution;
  }

  saveAll(executions: ReportExecution[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO report_executions
      (report_path, executed_at, status, request_type, user_name, parameters)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertMany = this.db.transaction((items: ReportExecution[]) => {
      for (const e of items) {
        stmt.run(
          e.reportPath,
          e.executedAt,
          e.status,
          e.requestType,
          e.userName,
          e.parameters
        );
      }
    });
    insertMany(executions);
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM report_executions').get() as any;
    return row?.count || 0;
  }

  deleteAll(): void {
    this.db.prepare('DELETE FROM report_executions').run();
  }
}
