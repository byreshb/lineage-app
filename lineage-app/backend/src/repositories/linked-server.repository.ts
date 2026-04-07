import Database from 'better-sqlite3';
import { LinkedServer } from '../types/index.js';

export class LinkedServerRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private mapRow(row: any): LinkedServer | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      alias: row.alias,
      actualServer: row.actual_server,
      provider: row.provider,
    };
  }

  findByAlias(alias: string): LinkedServer | undefined {
    const row = this.db.prepare('SELECT * FROM linked_servers WHERE UPPER(alias) = UPPER(?)').get(alias);
    return this.mapRow(row);
  }

  findAll(): LinkedServer[] {
    const rows = this.db.prepare('SELECT * FROM linked_servers ORDER BY alias').all();
    return rows.map((row) => this.mapRow(row)!);
  }

  save(server: LinkedServer): LinkedServer {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO linked_servers (alias, actual_server, provider)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(server.alias, server.actualServer, server.provider);
    if (server.id === null) {
      server.id = result.lastInsertRowid as number;
    }
    return server;
  }

  saveAll(servers: LinkedServer[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO linked_servers (alias, actual_server, provider)
      VALUES (?, ?, ?)
    `);
    const insertMany = this.db.transaction((items: LinkedServer[]) => {
      for (const s of items) {
        stmt.run(s.alias, s.actualServer, s.provider);
      }
    });
    insertMany(servers);
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM linked_servers').get() as any;
    return row?.count || 0;
  }

  deleteAll(): void {
    this.db.prepare('DELETE FROM linked_servers').run();
  }
}
