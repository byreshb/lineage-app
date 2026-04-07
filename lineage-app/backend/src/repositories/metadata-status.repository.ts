import Database from 'better-sqlite3';
import { MetadataStatus } from '../types/index.js';
import dayjs from 'dayjs';

const DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss';

export class MetadataStatusRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private mapRow(row: any): MetadataStatus | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      loadedAt: row.loaded_at,
      procCount: row.proc_count || 0,
      viewCount: row.view_count || 0,
      tableCount: row.table_count || 0,
      sharedDatasetCount: row.shared_dataset_count || 0,
      sharedDataSourceCount: row.shared_data_source_count || 0,
      linkedServerCount: row.linked_server_count || 0,
      dependencyCount: row.dependency_count || 0,
    };
  }

  get(): MetadataStatus | undefined {
    const row = this.db.prepare('SELECT * FROM metadata_status WHERE id = 1').get();
    return this.mapRow(row);
  }

  save(status: MetadataStatus): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO metadata_status (id, loaded_at, proc_count, view_count, table_count, shared_dataset_count, shared_data_source_count, linked_server_count, dependency_count)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      status.loadedAt || dayjs().format(DATE_FORMAT),
      status.procCount,
      status.viewCount,
      status.tableCount,
      status.sharedDatasetCount,
      status.sharedDataSourceCount,
      status.linkedServerCount,
      status.dependencyCount
    );
  }

  updateCounts(procCount: number, viewCount: number, tableCount: number, sharedDatasetCount: number, sharedDataSourceCount: number, linkedServerCount: number, dependencyCount: number): void {
    this.save({
      id: 1,
      loadedAt: dayjs().format(DATE_FORMAT),
      procCount,
      viewCount,
      tableCount,
      sharedDatasetCount,
      sharedDataSourceCount,
      linkedServerCount,
      dependencyCount,
    });
  }

  isLoaded(): boolean {
    const status = this.get();
    return status !== undefined && status.loadedAt !== null;
  }
}
