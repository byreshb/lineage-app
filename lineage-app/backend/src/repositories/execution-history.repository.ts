import Database from "better-sqlite3";
import { ReportExecutionHistory } from "../types/index.js";

export class ExecutionHistoryRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private mapRow(row: any): ReportExecutionHistory | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      reportName: row.report_name,
      reportPath: row.report_path,
      executionCount: row.execution_count || 0,
      lastExecutedAt: row.last_executed_at,
      firstExecutedAt: row.first_executed_at,
      daysSinceLastRun: row.days_since_last_run,
      successCount: row.success_count || 0,
      errorCount: row.error_count || 0,
      interactiveCount: row.interactive_count || 0,
      subscriptionCount: row.subscription_count || 0,
    };
  }

  findById(id: number): ReportExecutionHistory | undefined {
    const row = this.db
      .prepare("SELECT * FROM report_execution_history WHERE id = ?")
      .get(id);
    return this.mapRow(row);
  }

  findByPath(path: string): ReportExecutionHistory | undefined {
    const row = this.db
      .prepare("SELECT * FROM report_execution_history WHERE report_path = ?")
      .get(path);
    return this.mapRow(row);
  }

  findAll(): ReportExecutionHistory[] {
    const rows = this.db
      .prepare("SELECT * FROM report_execution_history ORDER BY report_path")
      .all();
    return rows.map((row) => this.mapRow(row)!);
  }

  save(history: ReportExecutionHistory): ReportExecutionHistory {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO report_execution_history
      (report_name, report_path, execution_count, last_executed_at, first_executed_at,
       days_since_last_run, success_count, error_count, interactive_count, subscription_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      history.reportName,
      history.reportPath,
      history.executionCount,
      history.lastExecutedAt,
      history.firstExecutedAt,
      history.daysSinceLastRun,
      history.successCount,
      history.errorCount,
      history.interactiveCount,
      history.subscriptionCount,
    );
    if (history.id === null) {
      history.id = result.lastInsertRowid as number;
    }
    return history;
  }

  saveAll(historyRecords: ReportExecutionHistory[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO report_execution_history
      (report_name, report_path, execution_count, last_executed_at, first_executed_at,
       days_since_last_run, success_count, error_count, interactive_count, subscription_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = this.db.transaction(
      (items: ReportExecutionHistory[]) => {
        for (const h of items) {
          stmt.run(
            h.reportName,
            h.reportPath,
            h.executionCount,
            h.lastExecutedAt,
            h.firstExecutedAt,
            h.daysSinceLastRun,
            h.successCount,
            h.errorCount,
            h.interactiveCount,
            h.subscriptionCount,
          );
        }
      },
    );
    insertMany(historyRecords);
  }

  count(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM report_execution_history")
      .get() as any;
    return row?.count || 0;
  }

  deleteAll(): void {
    this.db.prepare("DELETE FROM report_execution_history").run();
  }
}
