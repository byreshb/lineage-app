import Database from 'better-sqlite3';

export interface PbiLineageEdge {
  id: number | null;
  pbiReportId: number;
  sourceType: string;
  sourceId: number;
  sourceName: string;
  targetType: string;
  targetId: number | null;
  targetName: string;
  relationship: string;
}

export class PbiLineageRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private mapRow(row: any): PbiLineageEdge | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      pbiReportId: row.pbi_report_id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceName: row.source_name,
      targetType: row.target_type,
      targetId: row.target_id,
      targetName: row.target_name,
      relationship: row.relationship,
    };
  }

  findByReportId(pbiReportId: number): PbiLineageEdge[] {
    const rows = this.db.prepare(
      'SELECT * FROM pbi_lineage WHERE pbi_report_id = ? ORDER BY id'
    ).all(pbiReportId);
    return rows.map((row) => this.mapRow(row)!);
  }

  create(edge: Omit<PbiLineageEdge, 'id'>): PbiLineageEdge {
    const stmt = this.db.prepare(`
      INSERT INTO pbi_lineage (pbi_report_id, source_type, source_id, source_name, target_type, target_id, target_name, relationship)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      edge.pbiReportId,
      edge.sourceType,
      edge.sourceId,
      edge.sourceName,
      edge.targetType,
      edge.targetId,
      edge.targetName,
      edge.relationship
    );
    return {
      id: result.lastInsertRowid as number,
      ...edge,
    };
  }

  clearByReportId(pbiReportId: number): void {
    this.db.prepare('DELETE FROM pbi_lineage WHERE pbi_report_id = ?').run(pbiReportId);
  }

  clear(): void {
    this.db.prepare('DELETE FROM pbi_lineage').run();
  }

  countAll(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM pbi_lineage').get() as any;
    return row?.count || 0;
  }
}
