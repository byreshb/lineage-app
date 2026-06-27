import Database from "better-sqlite3";
import { Dataset, CommandType } from "../types/index.js";

export class DatasetRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private mapRow(row: any): Dataset | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      reportId: row.report_id,
      datasetName: row.dataset_name,
      commandType: row.command_type as CommandType | null,
      commandText: row.command_text,
      sharedDatasetPath: row.shared_dataset_path,
      fields: row.fields,
    };
  }

  findByReportId(reportId: number): Dataset[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM datasets WHERE report_id = ? ORDER BY dataset_name",
      )
      .all(reportId);
    return rows.map((row) => this.mapRow(row)!);
  }

  findById(id: number): Dataset | undefined {
    const row = this.db.prepare("SELECT * FROM datasets WHERE id = ?").get(id);
    return this.mapRow(row);
  }

  save(dataset: Dataset): Dataset {
    if (dataset.id === null) {
      const stmt = this.db.prepare(`
        INSERT INTO datasets (report_id, dataset_name, command_type, command_text, shared_dataset_path, fields)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        dataset.reportId,
        dataset.datasetName,
        dataset.commandType,
        dataset.commandText,
        dataset.sharedDatasetPath,
        dataset.fields,
      );
      dataset.id = result.lastInsertRowid as number;
    } else {
      const stmt = this.db.prepare(`
        UPDATE datasets SET report_id = ?, dataset_name = ?, command_type = ?, command_text = ?, shared_dataset_path = ?, fields = ?
        WHERE id = ?
      `);
      stmt.run(
        dataset.reportId,
        dataset.datasetName,
        dataset.commandType,
        dataset.commandText,
        dataset.sharedDatasetPath,
        dataset.fields,
        dataset.id,
      );
    }
    return dataset;
  }

  deleteByReportId(reportId: number): void {
    this.db.prepare("DELETE FROM datasets WHERE report_id = ?").run(reportId);
  }

  deleteById(id: number): void {
    this.db.prepare("DELETE FROM datasets WHERE id = ?").run(id);
  }
}
