import Database from "better-sqlite3";
import { SharedDataSource } from "../types/index.js";

export class SharedDataSourceRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private mapRow(row: any): SharedDataSource | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      dataSourceName: row.data_source_name,
      dataSourcePath: row.data_source_path,
      connectionString: row.connection_string,
      extension: row.extension,
      server: row.server,
      databaseName: row.database_name,
    };
  }

  findById(id: number): SharedDataSource | undefined {
    const row = this.db
      .prepare("SELECT * FROM shared_data_sources WHERE id = ?")
      .get(id);
    return this.mapRow(row);
  }

  findByName(name: string): SharedDataSource | undefined {
    const row = this.db
      .prepare("SELECT * FROM shared_data_sources WHERE data_source_name = ?")
      .get(name);
    return this.mapRow(row);
  }

  findByPath(path: string): SharedDataSource | undefined {
    const row = this.db
      .prepare("SELECT * FROM shared_data_sources WHERE data_source_path = ?")
      .get(path);
    return this.mapRow(row);
  }

  findAll(): SharedDataSource[] {
    const rows = this.db
      .prepare("SELECT * FROM shared_data_sources ORDER BY data_source_name")
      .all();
    return rows.map((row) => this.mapRow(row)!);
  }

  save(dataSource: SharedDataSource): SharedDataSource {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO shared_data_sources (data_source_name, data_source_path, connection_string, extension, server, database_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      dataSource.dataSourceName,
      dataSource.dataSourcePath,
      dataSource.connectionString,
      dataSource.extension,
      dataSource.server,
      dataSource.databaseName,
    );
    if (dataSource.id === null) {
      dataSource.id = result.lastInsertRowid as number;
    }
    return dataSource;
  }

  saveAll(dataSources: SharedDataSource[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO shared_data_sources (data_source_name, data_source_path, connection_string, extension, server, database_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertMany = this.db.transaction((items: SharedDataSource[]) => {
      for (const ds of items) {
        stmt.run(
          ds.dataSourceName,
          ds.dataSourcePath,
          ds.connectionString,
          ds.extension,
          ds.server,
          ds.databaseName,
        );
      }
    });
    insertMany(dataSources);
  }

  count(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM shared_data_sources")
      .get() as any;
    return row?.count || 0;
  }

  deleteAll(): void {
    this.db.prepare("DELETE FROM shared_data_sources").run();
  }
}
