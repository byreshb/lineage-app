import Database from "better-sqlite3";
import {
  LineageEdge,
  NodeType,
  Relationship,
  DiscoveryMethod,
} from "../types/index.js";

export class LineageRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  private mapRow(row: any): LineageEdge | undefined {
    if (!row) return undefined;
    return {
      id: row.id,
      reportId: row.report_id,
      sourceType: row.source_type as NodeType,
      sourceId: row.source_id,
      sourceName: row.source_name,
      targetType: row.target_type as NodeType,
      targetId: row.target_id,
      targetName: row.target_name,
      relationship: row.relationship as Relationship,
      discoveryMethod: row.discovery_method as DiscoveryMethod,
    };
  }

  findByReportId(reportId: number): LineageEdge[] {
    const rows = this.db
      .prepare("SELECT * FROM lineage WHERE report_id = ?")
      .all(reportId);
    return rows.map((row) => this.mapRow(row)!);
  }

  findById(id: number): LineageEdge | undefined {
    const row = this.db.prepare("SELECT * FROM lineage WHERE id = ?").get(id);
    return this.mapRow(row);
  }

  findTableEdgesByReportId(reportId: number): LineageEdge[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM lineage WHERE report_id = ? AND target_type IN ('TABLE', 'TABLE_NOT_FOUND')",
      )
      .all(reportId);
    return rows.map((row) => this.mapRow(row)!);
  }

  save(edge: LineageEdge): LineageEdge {
    if (edge.id === null) {
      const stmt = this.db.prepare(`
        INSERT INTO lineage (report_id, source_type, source_id, source_name, target_type, target_id, target_name, relationship, discovery_method)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        edge.reportId,
        edge.sourceType,
        edge.sourceId,
        edge.sourceName,
        edge.targetType,
        edge.targetId,
        edge.targetName,
        edge.relationship,
        edge.discoveryMethod || "REGEX",
      );
      edge.id = result.lastInsertRowid as number;
    } else {
      const stmt = this.db.prepare(`
        UPDATE lineage SET report_id = ?, source_type = ?, source_id = ?, source_name = ?, target_type = ?, target_id = ?, target_name = ?, relationship = ?, discovery_method = ?
        WHERE id = ?
      `);
      stmt.run(
        edge.reportId,
        edge.sourceType,
        edge.sourceId,
        edge.sourceName,
        edge.targetType,
        edge.targetId,
        edge.targetName,
        edge.relationship,
        edge.discoveryMethod || "REGEX",
        edge.id,
      );
    }
    return edge;
  }

  saveAll(edges: LineageEdge[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO lineage (report_id, source_type, source_id, source_name, target_type, target_id, target_name, relationship, discovery_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = this.db.transaction((items: LineageEdge[]) => {
      for (const edge of items) {
        stmt.run(
          edge.reportId,
          edge.sourceType,
          edge.sourceId,
          edge.sourceName,
          edge.targetType,
          edge.targetId,
          edge.targetName,
          edge.relationship,
          edge.discoveryMethod || "REGEX",
        );
      }
    });
    insertMany(edges);
  }

  deleteByReportId(reportId: number): void {
    this.db.prepare("DELETE FROM lineage WHERE report_id = ?").run(reportId);
  }

  deleteById(id: number): void {
    this.db.prepare("DELETE FROM lineage WHERE id = ?").run(id);
  }
}
