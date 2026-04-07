import Database from 'better-sqlite3';
import { SharedDataset } from '../types/index.js';

export class SharedDatasetRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private mapRow(row: any): SharedDataset | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      datasetName: row.dataset_name,
      datasetPath: row.dataset_path,
      commandType: row.command_type,
      commandText: row.command_text,
    };
  }

  findById(id: number): SharedDataset | undefined {
    const row = this.db.prepare('SELECT * FROM shared_datasets WHERE id = ?').get(id);
    return this.mapRow(row);
  }

  findByName(name: string): SharedDataset | undefined {
    const row = this.db.prepare('SELECT * FROM shared_datasets WHERE dataset_name = ?').get(name);
    return this.mapRow(row);
  }

  findByPath(path: string): SharedDataset | undefined {
    const row = this.db.prepare('SELECT * FROM shared_datasets WHERE dataset_path = ?').get(path);
    return this.mapRow(row);
  }

  findAll(): SharedDataset[] {
    const rows = this.db.prepare('SELECT * FROM shared_datasets ORDER BY dataset_name').all();
    return rows.map((row) => this.mapRow(row)!);
  }

  save(dataset: SharedDataset): SharedDataset {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO shared_datasets (dataset_name, dataset_path, command_type, command_text)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(
      dataset.datasetName,
      dataset.datasetPath,
      dataset.commandType,
      dataset.commandText
    );
    if (dataset.id === null) {
      dataset.id = result.lastInsertRowid as number;
    }
    return dataset;
  }

  saveAll(datasets: SharedDataset[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO shared_datasets (dataset_name, dataset_path, command_type, command_text)
      VALUES (?, ?, ?, ?)
    `);
    const insertMany = this.db.transaction((items: SharedDataset[]) => {
      for (const ds of items) {
        stmt.run(ds.datasetName, ds.datasetPath, ds.commandType, ds.commandText);
      }
    });
    insertMany(datasets);
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM shared_datasets').get() as any;
    return row?.count || 0;
  }

  deleteAll(): void {
    this.db.prepare('DELETE FROM shared_datasets').run();
  }
}
