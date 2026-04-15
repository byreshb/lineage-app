import { Repositories } from '../repositories/index.js';
import { loadPbiExcel, getDefaultPbiExcelPath, PbiExcelRow } from '../parsers/excel.loader.js';
import { extractTables, extractProcedureCalls } from '../parsers/sql.analyzer.js';
import { resolvedPaths } from '../config/index.js';

export interface PbiLineageNode {
  id: string;
  name: string;
  type: string;
  database?: string | null;
  schema?: string | null;
}

export interface PbiLineageEdge {
  source: string;
  target: string;
  relationship: string;
}

export interface PbiLineageGraph {
  reportId: number;
  reportName: string;
  nodes: PbiLineageNode[];
  edges: PbiLineageEdge[];
}

export interface PbiSourceTable {
  id: number;
  // From Excel file
  pbiTableName: string;           // PBI table name in Excel (Column B)
  excelReference: string;         // Source reference from Excel (e.g., "bi.vInvBalances")
  excelDatabase: string | null;   // Database from Excel (Column F)
  // Resolved from database
  resolvedName: string;           // Actual name in database (e.g., "vInvBalances")
  resolvedSchema: string;         // Actual schema in database (e.g., "bi")
  resolvedDatabase: string | null; // Actual database
  resolvedFullName: string;       // schema.name format (e.g., "bi.vInvBalances")
  entityType: string;             // VIEW, TABLE, UNKNOWN
  status: string;                 // OK, NOT_FOUND, EXTERNAL
  nestedViews?: string[];
  externalSources?: string[];     // List of external database/schema references
}

export class PbiLineageService {
  constructor(private repos: Repositories) {}

  /**
   * Normalize Power BI entity names to schema.table format.
   *
   * Power BI Excel data uses SPACE-separated format: "bi vWipMaster"
   * SSRS RDL data uses DOT-separated format: "dbo.vBlahBlah"
   *
   * This converts PBI space format to standard dot notation for database lookups.
   *
   * @param entityName - Entity name from Excel (may use space or dot separator)
   * @returns Normalized name using dot separator
   */
  private normalizePbiEntityName(entityName: string): string {
    if (!entityName) return entityName;

    const trimmed = entityName.trim();

    // If already has a dot, assume it's already normalized (backward compatibility)
    if (trimmed.includes('.')) return trimmed;

    // Check for single space separating two parts (schema table)
    const parts = trimmed.split(/\s+/);

    // If exactly 2 parts, convert "schema table" to "schema.table"
    if (parts.length === 2) {
      return `${parts[0]}.${parts[1]}`;
    }

    // No spaces or multiple spaces - return as-is
    return trimmed;
  }

  /**
   * Load Power BI data from Excel file and populate database
   */
  loadFromExcel(filePath?: string): { reportCount: number; tableCount: number } {
    const excelPath = filePath || getDefaultPbiExcelPath(resolvedPaths.csvFolder);
    console.log(`Loading PBI data from: ${excelPath}`);

    const rows = loadPbiExcel(excelPath);

    // Clear existing data
    this.repos.pbiLineage.clear();
    this.repos.pbiTable.clear();
    this.repos.pbiReport.clear();

    // Group rows by report
    const reportMap = new Map<string, PbiExcelRow[]>();
    for (const row of rows) {
      if (!reportMap.has(row.pbiFile)) {
        reportMap.set(row.pbiFile, []);
      }
      reportMap.get(row.pbiFile)!.push(row);
    }

    let tableCount = 0;

    // Create reports and tables
    for (const [reportName, reportRows] of reportMap) {
      const report = this.repos.pbiReport.create(reportName);

      for (const row of reportRows) {
        this.repos.pbiTable.create({
          pbiReportId: report.id!,
          tableName: row.pbiTable || 'Unknown',
          sourceDatabase: row.sourceDatabase || null,
          sourceViewOrTable: row.sourceViewOrTable || null,
        });
        tableCount++;
      }
    }

    console.log(`Loaded ${reportMap.size} PBI reports with ${tableCount} tables`);

    return {
      reportCount: reportMap.size,
      tableCount,
    };
  }

  /**
   * Build lineage graph for D3 visualization
   */
  buildLineageGraph(reportId: number): PbiLineageGraph {
    const report = this.repos.pbiReport.findById(reportId);
    if (!report) throw new Error(`PBI Report not found: ${reportId}`);

    const tables = this.repos.pbiTable.findByReportId(reportId);

    // Clear existing lineage for this report
    this.repos.pbiLineage.clearByReportId(reportId);

    const nodesMap = new Map<string, PbiLineageNode>();
    const edges: PbiLineageEdge[] = [];

    // Add report node
    const reportNodeId = `PBI_REPORT_${reportId}`;
    nodesMap.set(reportNodeId, {
      id: reportNodeId,
      name: report.reportName,
      type: 'PBI_REPORT',
    });

    // Process each table in the report
    for (const pbiTable of tables) {
      // Add PBI table node
      const tableNodeId = `PBI_TABLE_${pbiTable.id}`;
      nodesMap.set(tableNodeId, {
        id: tableNodeId,
        name: pbiTable.tableName,
        type: 'PBI_TABLE',
        database: pbiTable.sourceDatabase,
      });

      // Edge: Report -> PBI Table
      edges.push({
        source: reportNodeId,
        target: tableNodeId,
        relationship: 'CONTAINS',
      });

      // Save edge to database
      this.repos.pbiLineage.create({
        pbiReportId: reportId,
        sourceType: 'PBI_REPORT',
        sourceId: reportId,
        sourceName: report.reportName,
        targetType: 'PBI_TABLE',
        targetId: pbiTable.id!,
        targetName: pbiTable.tableName,
        relationship: 'CONTAINS',
      });

      // Process source view/table
      if (pbiTable.sourceViewOrTable) {
        this.processSourceEntity(
          reportId,
          tableNodeId,
          pbiTable.tableName,
          pbiTable.sourceViewOrTable,
          pbiTable.sourceDatabase,
          nodesMap,
          edges,
          new Set()
        );
      }
    }

    return {
      reportId,
      reportName: report.reportName,
      nodes: Array.from(nodesMap.values()),
      edges,
    };
  }

  /**
   * Process a source entity (view or table) and detect nested views
   */
  private processSourceEntity(
    reportId: number,
    sourceNodeId: string,
    sourceName: string,
    entityName: string,
    database: string | null,
    nodesMap: Map<string, PbiLineageNode>,
    edges: PbiLineageEdge[],
    visitedViews: Set<string>
  ): void {
    // Prevent infinite loops
    const viewKey = entityName.toLowerCase();
    if (visitedViews.has(viewKey)) return;
    visitedViews.add(viewKey);

    if (visitedViews.size > 20) {
      console.warn(`Max view depth reached while processing ${entityName}`);
      return;
    }

    // Check if it's a view in our metadata
    const normalizedName = this.normalizePbiEntityName(entityName);
    const view = this.repos.view.findByName(normalizedName);

    if (view) {
      // It's a view - add VIEW node
      const viewNodeId = `VIEW_${view.id}`;
      if (!nodesMap.has(viewNodeId)) {
        nodesMap.set(viewNodeId, {
          id: viewNodeId,
          name: view.viewName,
          type: 'VIEW',
          schema: view.schemaName,
        });
      }

      // Edge: Source -> VIEW
      edges.push({
        source: sourceNodeId,
        target: viewNodeId,
        relationship: 'READS_FROM',
      });

      // Save edge to database
      this.repos.pbiLineage.create({
        pbiReportId: reportId,
        sourceType: sourceNodeId.startsWith('PBI_TABLE') ? 'PBI_TABLE' : 'VIEW',
        sourceId: parseInt(sourceNodeId.split('_').pop() || '0'),
        sourceName: sourceName,
        targetType: 'VIEW',
        targetId: view.id!,
        targetName: view.viewName,
        relationship: 'READS_FROM',
      });

      // Also add view's full name and short name to visited to prevent duplicates
      const fullName = `${view.schemaName}.${view.viewName}`.toLowerCase();
      visitedViews.add(fullName);
      visitedViews.add(view.viewName.toLowerCase());

      // Analyze view definition to find nested entities
      if (view.definition) {
        const tableRefs = extractTables(view.definition);
        for (const ref of tableRefs) {
          // Skip self-references
          if (ref.tableName.toLowerCase() === view.viewName.toLowerCase()) continue;
          if (ref.tableName.toLowerCase() === fullName) continue;

          // Build full entity name (schema.table if schema exists)
          let nestedEntityName = ref.tableName;
          if (ref.schema) {
            nestedEntityName = `${ref.schema}.${ref.tableName}`;
          }

          // Recursively process nested views/tables
          this.processSourceEntity(
            reportId,
            viewNodeId,
            view.viewName,
            nestedEntityName,
            database,
            nodesMap,
            edges,
            visitedViews
          );
        }

        // Also check for EXEC statements in view definitions (VIEW -> PROC chains)
        const procCalls = extractProcedureCalls(view.definition);
        for (const procCall of procCalls) {
          const procName = procCall.schema ? `${procCall.schema}.${procCall.procName}` : procCall.procName;
          const proc = this.repos.storedProc.findByName(procCall.procName);

          if (proc) {
            const procNodeId = `PROC_${proc.id}`;
            if (!nodesMap.has(procNodeId)) {
              nodesMap.set(procNodeId, {
                id: procNodeId,
                name: proc.procName,
                type: 'PROC',
                schema: proc.schemaName,
              });
            }

            edges.push({
              source: viewNodeId,
              target: procNodeId,
              relationship: 'CALLS',
            });

            this.repos.pbiLineage.create({
              pbiReportId: reportId,
              sourceType: 'VIEW',
              sourceId: view.id!,
              sourceName: view.viewName,
              targetType: 'PROC',
              targetId: proc.id!,
              targetName: proc.procName,
              relationship: 'CALLS',
            });

            // Recursively analyze proc definition for tables/views
            if (proc.definition) {
              const procTableRefs = extractTables(proc.definition);
              for (const ref of procTableRefs) {
                // Build full entity name (schema.table if schema exists)
                let nestedEntityName = ref.tableName;
                if (ref.schema) {
                  nestedEntityName = `${ref.schema}.${ref.tableName}`;
                }

                this.processSourceEntity(
                  reportId,
                  procNodeId,
                  proc.procName,
                  nestedEntityName,
                  database,
                  nodesMap,
                  edges,
                  visitedViews
                );
              }
            }
          }
        }
      }
    } else {
      // Check if it's a table
      const table = this.repos.table.findByName(normalizedName);

      if (table) {
        const tableNodeId = `TABLE_${table.id}`;
        if (!nodesMap.has(tableNodeId)) {
          nodesMap.set(tableNodeId, {
            id: tableNodeId,
            name: table.tableName,
            type: 'TABLE',
            database: table.databaseName,
            schema: table.schemaName,
          });
        }

        // Edge: Source -> TABLE
        edges.push({
          source: sourceNodeId,
          target: tableNodeId,
          relationship: 'READS_FROM',
        });

        // Save edge to database
        this.repos.pbiLineage.create({
          pbiReportId: reportId,
          sourceType: sourceNodeId.startsWith('PBI_TABLE') ? 'PBI_TABLE' : 'VIEW',
          sourceId: parseInt(sourceNodeId.split('_').pop() || '0'),
          sourceName: sourceName,
          targetType: 'TABLE',
          targetId: table.id!,
          targetName: table.tableName,
          relationship: 'READS_FROM',
        });
      } else {
        // Entity not found - add as TABLE_NOT_FOUND
        const notFoundId = `TABLE_NOT_FOUND_${entityName.replace(/[^a-zA-Z0-9]/g, '_')}`;
        if (!nodesMap.has(notFoundId)) {
          nodesMap.set(notFoundId, {
            id: notFoundId,
            name: entityName,
            type: 'TABLE_NOT_FOUND',
          });
        }

        edges.push({
          source: sourceNodeId,
          target: notFoundId,
          relationship: 'READS_FROM',
        });

        this.repos.pbiLineage.create({
          pbiReportId: reportId,
          sourceType: sourceNodeId.startsWith('PBI_TABLE') ? 'PBI_TABLE' : 'VIEW',
          sourceId: parseInt(sourceNodeId.split('_').pop() || '0'),
          sourceName: sourceName,
          targetType: 'TABLE_NOT_FOUND',
          targetId: null,
          targetName: entityName,
          relationship: 'READS_FROM',
        });
      }
    }
  }

  /**
   * Get source tables for a PBI report
   */
  getSourceTables(reportId: number): PbiSourceTable[] {
    const report = this.repos.pbiReport.findById(reportId);
    if (!report) throw new Error(`PBI Report not found: ${reportId}`);

    const tables = this.repos.pbiTable.findByReportId(reportId);
    const results: PbiSourceTable[] = [];

    for (const pbiTable of tables) {
      const entityName = pbiTable.sourceViewOrTable;
      if (!entityName) continue;

      const normalizedName = this.normalizePbiEntityName(entityName);
      const nestedViews = this.detectNestedViews(normalizedName, new Set());

      // Check what type of entity this is
      const view = this.repos.view.findByName(normalizedName);
      const table = this.repos.table.findByName(normalizedName);

      if (view) {
        // Check for external sources in the view chain
        const externalSources = this.detectExternalSources(entityName, new Set());
        const hasComplete = this.hasCompleteLineage(entityName, new Set());

        // Determine status: Yes if ends in table, EXTERNAL if has external refs, PARTIAL if both
        let status = 'Yes';
        if (externalSources.length > 0 && !hasComplete) {
          status = 'EXTERNAL';
        } else if (externalSources.length > 0 && hasComplete) {
          status = 'PARTIAL'; // Has both complete paths and external refs
        }

        results.push({
          id: view.id!,
          pbiTableName: pbiTable.tableName,
          excelReference: entityName,
          excelDatabase: pbiTable.sourceDatabase,
          resolvedName: view.viewName,
          resolvedSchema: view.schemaName,
          resolvedDatabase: pbiTable.sourceDatabase,
          resolvedFullName: `${view.schemaName}.${view.viewName}`,
          entityType: 'VIEW',
          status,
          nestedViews: nestedViews.length > 0 ? nestedViews : undefined,
          externalSources: externalSources.length > 0 ? externalSources : undefined,
        });
      } else if (table) {
        results.push({
          id: table.id!,
          pbiTableName: pbiTable.tableName,
          excelReference: entityName,
          excelDatabase: pbiTable.sourceDatabase,
          resolvedName: table.tableName,
          resolvedSchema: table.schemaName,
          resolvedDatabase: table.databaseName,
          resolvedFullName: `${table.schemaName}.${table.tableName}`,
          entityType: 'TABLE',
          status: 'Yes',
        });
      } else {
        // Parse schema.table from entity name for NOT_FOUND entries
        const normalizedName = this.normalizePbiEntityName(entityName);
        const parts = normalizedName.split('.');
        let notFoundSchema = '';
        let notFoundTable = normalizedName;
        if (parts.length >= 2) {
          notFoundSchema = parts[parts.length - 2];
          notFoundTable = parts[parts.length - 1];
        }

        results.push({
          id: 0,
          pbiTableName: pbiTable.tableName,
          excelReference: entityName,
          excelDatabase: pbiTable.sourceDatabase,
          resolvedName: notFoundTable,
          resolvedSchema: notFoundSchema,
          resolvedDatabase: pbiTable.sourceDatabase,
          resolvedFullName: normalizedName,
          entityType: 'NOT_FOUND',
          status: 'NOT_FOUND',
        });
      }
    }

    return results;
  }

  /**
   * Detect nested views recursively
   */
  private detectNestedViews(viewName: string, visited: Set<string>): string[] {
    if (visited.has(viewName.toLowerCase())) return [];
    visited.add(viewName.toLowerCase());

    if (visited.size > 20) return [];

    const normalizedName = this.normalizePbiEntityName(viewName);
    const view = this.repos.view.findByName(normalizedName);
    if (!view || !view.definition) return [];

    // Also add the found view's full name and short name to visited to prevent duplicates
    const currentFullName = `${view.schemaName}.${view.viewName}`.toLowerCase();
    visited.add(currentFullName);
    visited.add(view.viewName.toLowerCase());

    const nestedViews: string[] = [];
    const tableRefs = extractTables(view.definition);

    for (const ref of tableRefs) {
      const nestedView = this.repos.view.findByName(ref.tableName);
      if (nestedView) {
        // Use schema.viewName format for clarity
        const fullName = `${nestedView.schemaName}.${nestedView.viewName}`;

        // Skip if already visited (prevents duplicates)
        if (visited.has(fullName.toLowerCase())) continue;
        if (visited.has(nestedView.viewName.toLowerCase())) continue;

        nestedViews.push(fullName);
        // Recursively get nested views
        const deeper = this.detectNestedViews(fullName, visited);
        nestedViews.push(...deeper);
      }
    }

    return nestedViews;
  }

  /**
   * Detect external sources - tables/views referenced but not in our metadata
   */
  private detectExternalSources(viewName: string, visited: Set<string>): string[] {
    if (visited.has(viewName.toLowerCase())) return [];
    visited.add(viewName.toLowerCase());

    if (visited.size > 20) return [];

    const normalizedName = this.normalizePbiEntityName(viewName);
    const view = this.repos.view.findByName(normalizedName);
    if (!view || !view.definition) return [];

    const externalSources: string[] = [];
    const tableRefs = extractTables(view.definition);

    for (const ref of tableRefs) {
      // Build full reference name based on what's available
      let refName = ref.tableName;
      let lookupName = refName;

      if (ref.database && ref.schema) {
        // 3-part name: database.schema.table
        refName = `${ref.database}.${ref.schema}.${ref.tableName}`;
        lookupName = `${ref.schema}.${ref.tableName}`;
      } else if (ref.schema) {
        // 2-part name: schema.table
        refName = `${ref.schema}.${ref.tableName}`;
        lookupName = refName;
      }

      const nestedView = this.repos.view.findByName(lookupName);
      const nestedTable = this.repos.table.findByName(lookupName);

      if (nestedView) {
        // Recursively check nested views for external sources
        const deeper = this.detectExternalSources(`${nestedView.schemaName}.${nestedView.viewName}`, visited);
        externalSources.push(...deeper);
      } else if (nestedTable) {
        // Found in our tables - not external
      } else {
        // Not found - this is an external source
        externalSources.push(refName);
      }
    }

    return [...new Set(externalSources)]; // Remove duplicates
  }

  /**
   * Check if a view chain has any path that ends in a table (complete lineage)
   */
  private hasCompleteLineage(viewName: string, visited: Set<string>): boolean {
    if (visited.has(viewName.toLowerCase())) return false;
    visited.add(viewName.toLowerCase());

    if (visited.size > 20) return false;

    const normalizedName = this.normalizePbiEntityName(viewName);
    const view = this.repos.view.findByName(normalizedName);
    if (!view || !view.definition) return false;

    const tableRefs = extractTables(view.definition);
    if (tableRefs.length === 0) return false;

    for (const ref of tableRefs) {
      // Build lookup name
      let lookupName = ref.tableName;
      if (ref.database && ref.schema) {
        lookupName = `${ref.schema}.${ref.tableName}`;
      } else if (ref.schema) {
        lookupName = `${ref.schema}.${ref.tableName}`;
      }

      const nestedView = this.repos.view.findByName(lookupName);
      const nestedTable = this.repos.table.findByName(lookupName);

      if (nestedTable) {
        return true; // Found a table - complete lineage exists
      }
      if (nestedView) {
        if (this.hasCompleteLineage(`${nestedView.schemaName}.${nestedView.viewName}`, new Set(visited))) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get lineage graph from database (pre-built)
   */
  getLineageGraph(reportId: number): PbiLineageGraph {
    const report = this.repos.pbiReport.findById(reportId);
    if (!report) throw new Error(`PBI Report not found: ${reportId}`);

    const edges = this.repos.pbiLineage.findByReportId(reportId);

    // If no edges exist, build the lineage first
    if (edges.length === 0) {
      return this.buildLineageGraph(reportId);
    }

    const nodesMap = new Map<string, PbiLineageNode>();

    for (const edge of edges) {
      // Add source node
      const sourceKey = `${edge.sourceType}_${edge.sourceId}`;
      if (!nodesMap.has(sourceKey)) {
        nodesMap.set(sourceKey, {
          id: sourceKey,
          name: edge.sourceName,
          type: edge.sourceType,
        });
      }

      // Add target node
      const targetKey = edge.targetId
        ? `${edge.targetType}_${edge.targetId}`
        : `${edge.targetType}_${edge.targetName.replace(/[^a-zA-Z0-9]/g, '_')}`;
      if (!nodesMap.has(targetKey)) {
        nodesMap.set(targetKey, {
          id: targetKey,
          name: edge.targetName,
          type: edge.targetType,
        });
      }
    }

    return {
      reportId,
      reportName: report.reportName,
      nodes: Array.from(nodesMap.values()),
      edges: edges.map((e) => ({
        source: `${e.sourceType}_${e.sourceId}`,
        target: e.targetId
          ? `${e.targetType}_${e.targetId}`
          : `${e.targetType}_${e.targetName.replace(/[^a-zA-Z0-9]/g, '_')}`,
        relationship: e.relationship,
      })),
    };
  }

  /**
   * Export single PBI report lineage to CSV
   * Uses same format as SSRS export with Proc1-10, View1-10 columns
   */
  exportToCsv(reportId: number): string {
    const report = this.repos.pbiReport.findById(reportId);
    if (!report) throw new Error(`PBI Report not found: ${reportId}`);

    return this.buildPbiCsv([report]);
  }

  /**
   * Export all PBI reports lineage to CSV
   * Uses same format as SSRS export with Proc1-10, View1-10 columns
   */
  exportAllToCsv(): string {
    const reports = this.repos.pbiReport.findAll();
    return this.buildPbiCsv(reports);
  }

  /**
   * Export only starred PBI reports lineage to CSV
   */
  exportStarredToCsv(): string {
    const reports = this.repos.pbiReport.findStarred();
    return this.buildPbiCsv(reports);
  }

  /**
   * Build CSV with same format as SSRS (Proc1-10, View1-10 columns)
   */
  private buildPbiCsv(reports: any[]): string {
    // CSV header - matches SSRS export format
    const header = [
      'ReportType',
      'Report Name',
      'Report Path',
      'Dataset',
      'Dataset Type',
      'Proc1', 'Proc2', 'Proc3', 'Proc4', 'Proc5', 'Proc6', 'Proc7', 'Proc8', 'Proc9', 'Proc10',
      'View1', 'View2', 'View3', 'View4', 'View5', 'View6', 'View7', 'View8', 'View9', 'View10',
      'Comment',
      'Table',
      'Schema',
      'Server',
      'Database',
      'In SQL2(D300SQLDW01)',
      'SQL2(D300SQLDW01) Has PK'
    ].join(',') + '\n';

    let csv = header;

    for (const report of reports) {
      const tables = this.repos.pbiTable.findByReportId(report.id!);

      if (tables.length === 0) {
        csv += this.formatPbiCsvRow({
          reportType: 'PowerBI',
          reportName: report.reportName,
          reportPath: '',
          datasetName: '',
          datasetType: 'PowerBI',
          procs: [],
          views: [],
          comment: '',
          metadataTable: 'No tables in report',
          metadataSchema: '',
          sourceServer: '',
          sourceDatabase: '',
          status: 'NO TABLES',
          hasPk: '-',
        });
        continue;
      }

      for (const pbiTable of tables) {
        const entityName = pbiTable.sourceViewOrTable || '';
        const sourceDb = pbiTable.sourceDatabase || '';

        if (!entityName) {
          csv += this.formatPbiCsvRow({
            reportType: 'PowerBI',
            reportName: report.reportName,
            reportPath: '',
            datasetName: pbiTable.tableName,
            datasetType: 'PowerBI',
            procs: [],
            views: [],
            comment: '',
            metadataTable: 'No source entity specified',
            metadataSchema: '',
            sourceServer: '',
            sourceDatabase: sourceDb,
            status: 'NO SOURCE',
            hasPk: '-',
          });
          continue;
        }

        const normalizedName = this.normalizePbiEntityName(entityName);

        // Check if it's directly a table
        const directTable = this.repos.table.findByName(normalizedName);
        if (directTable) {
          csv += this.formatPbiCsvRow({
            reportType: 'PowerBI',
            reportName: report.reportName,
            reportPath: '',
            datasetName: pbiTable.tableName,
            datasetType: 'PowerBI',
            procs: [],
            views: [],
            comment: '',
            metadataTable: directTable.tableName,
            metadataSchema: directTable.schemaName || '',
            sourceServer: '',
            sourceDatabase: sourceDb,
            status: 'Yes',
            hasPk: directTable.hasPk === true ? 'Yes' : directTable.hasPk === false ? 'No' : '-',
          });
          continue;
        }

        // Check if it's a view - trace to base tables
        const view = this.repos.view.findByName(normalizedName);
        if (view) {
          // Find all base tables through nested views
          const baseTables = this.findAllBaseTablesForPbi(normalizedName, [], [], new Set());

          if (baseTables.length === 0) {
            // View exists but has no traceable tables
            csv += this.formatPbiCsvRow({
              reportType: 'PowerBI',
              reportName: report.reportName,
              reportPath: '',
              datasetName: pbiTable.tableName,
              datasetType: 'PowerBI',
              procs: [],
              views: [normalizedName],
              comment: '',
              metadataTable: 'No base tables found in view',
              metadataSchema: view.schemaName || '',
              sourceServer: '',
              sourceDatabase: sourceDb,
              status: 'VIEW_NO_TABLES',
              hasPk: '-',
            });
            continue;
          }

          // Output one row per base table found
          for (const bt of baseTables) {
            const allViews = [normalizedName, ...bt.viewPath];
            const { procs, views, comment } = this.splitPathsWithOverflow(bt.procPath, allViews);
            // Add comment for external tables not found in metadata
            const finalComment = bt.isExternal
              ? (comment ? `${comment}; Table in view SQL not found (in tables_with_pks.csv)` : 'Table in view SQL not found (in tables_with_pks.csv)')
              : comment;

            csv += this.formatPbiCsvRow({
              reportType: 'PowerBI',
              reportName: report.reportName,
              reportPath: '',
              datasetName: pbiTable.tableName,
              datasetType: 'PowerBI',
              procs,
              views,
              comment: finalComment,
              metadataTable: bt.tableName,
              metadataSchema: bt.schema,
              sourceServer: '',
              sourceDatabase: sourceDb,
              status: bt.isExternal ? 'No' : 'Yes',
              hasPk: bt.hasPk || '-',
            });
          }
        } else {
          // Not found as table or view
          const parts = normalizedName.split('.');
          let notFoundSchema = '';
          let notFoundTable = normalizedName;
          if (parts.length >= 2) {
            notFoundSchema = parts[parts.length - 2];
            notFoundTable = parts[parts.length - 1];
          }

          csv += this.formatPbiCsvRow({
            reportType: 'PowerBI',
            reportName: report.reportName,
            reportPath: '',
            datasetName: pbiTable.tableName,
            datasetType: 'PowerBI',
            procs: [],
            views: [],
            comment: `Excel source not found (in all_views.csv): ${entityName}`,
            metadataTable: notFoundTable,
            metadataSchema: notFoundSchema,
            sourceServer: '',
            sourceDatabase: sourceDb,
            status: 'No',
            hasPk: '-',
          });
        }
      }
    }

    return csv;
  }

  /**
   * Find all base tables from a view for PBI export
   */
  private findAllBaseTablesForPbi(
    viewName: string,
    currentViewPath: string[],
    currentProcPath: string[],
    visited: Set<string>
  ): { tableName: string; schema: string; viewPath: string[]; procPath: string[]; isExternal: boolean; metadataServer: string; metadataDatabase: string; hasPk: string }[] {
    const lowerName = viewName.toLowerCase();
    if (visited.has(lowerName)) return [];
    visited.add(lowerName);
    if (visited.size > 50) return [];

    const normalizedName = this.normalizePbiEntityName(viewName);
    const view = this.repos.view.findByName(normalizedName);
    if (!view || !view.definition) return [];

    const fullName = `${view.schemaName}.${view.viewName}`;
    visited.add(fullName.toLowerCase());

    const results: { tableName: string; schema: string; viewPath: string[]; procPath: string[]; isExternal: boolean; metadataServer: string; metadataDatabase: string; hasPk: string }[] = [];
    const tableRefs = extractTables(view.definition);

    for (const ref of tableRefs) {
      let lookupName = ref.tableName;
      let refDatabase = ref.database || '';
      let refSchema = ref.schema || '';

      if (ref.database && ref.schema) {
        lookupName = `${ref.schema}.${ref.tableName}`;
      } else if (ref.schema) {
        lookupName = `${ref.schema}.${ref.tableName}`;
      }

      if (visited.has(lookupName.toLowerCase())) continue;

      // Check if it's another view - recurse
      const nestedView = this.repos.view.findByName(lookupName);
      if (nestedView) {
        const nestedFullName = `${nestedView.schemaName}.${nestedView.viewName}`;
        const newViewPath = [...currentViewPath, nestedFullName];
        const deeper = this.findAllBaseTablesForPbi(nestedFullName, newViewPath, currentProcPath, visited);
        results.push(...deeper);
        continue;
      }

      // Check if it's a table in our metadata
      const table = this.repos.table.findByName(lookupName);
      if (table) {
        results.push({
          tableName: table.tableName,
          schema: table.schemaName || refSchema,
          viewPath: currentViewPath,
          procPath: currentProcPath,
          isExternal: false,
          metadataServer: table.server || '',
          metadataDatabase: table.databaseName || '',
          hasPk: table.hasPk === true ? 'Yes' : table.hasPk === false ? 'No' : '-',
        });
      } else {
        // External table - not in our metadata
        results.push({
          tableName: ref.tableName,
          schema: refSchema,
          viewPath: currentViewPath,
          procPath: currentProcPath,
          isExternal: true,
          metadataServer: '',
          metadataDatabase: refDatabase,
          hasPk: '-',
        });
      }
    }

    // Check for EXEC statements (proc calls from view)
    const procCalls = extractProcedureCalls(view.definition);
    for (const procCall of procCalls) {
      const proc = this.repos.storedProc.findByName(procCall.procName);
      if (proc && proc.definition) {
        const procFullName = `${proc.schemaName}.${proc.procName}`;
        const newProcPath = [...currentProcPath, procFullName];

        // Get tables from this proc
        const procTableRefs = extractTables(proc.definition);
        for (const ref of procTableRefs) {
          let lookupName = ref.tableName;
          if (ref.schema) {
            lookupName = `${ref.schema}.${ref.tableName}`;
          }

          if (visited.has(lookupName.toLowerCase())) continue;
          visited.add(lookupName.toLowerCase());

          // Check if it's a view
          const nestedView = this.repos.view.findByName(lookupName);
          if (nestedView) {
            const nestedFullName = `${nestedView.schemaName}.${nestedView.viewName}`;
            const deeper = this.findAllBaseTablesForPbi(nestedFullName, [], newProcPath, visited);
            results.push(...deeper);
            continue;
          }

          // Check if it's a table
          const table = this.repos.table.findByName(lookupName);
          if (table) {
            results.push({
              tableName: table.tableName,
              schema: table.schemaName || ref.schema || '',
              viewPath: [],
              procPath: newProcPath,
              isExternal: false,
              metadataServer: table.server || '',
              metadataDatabase: table.databaseName || '',
              hasPk: table.hasPk === true ? 'Yes' : table.hasPk === false ? 'No' : '-',
            });
          } else {
            results.push({
              tableName: ref.tableName,
              schema: ref.schema || '',
              viewPath: [],
              procPath: newProcPath,
              isExternal: true,
              metadataServer: '',
              metadataDatabase: ref.database || '',
              hasPk: '-',
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Split procs and views into max 10 each, with overflow going to comment
   */
  private splitPathsWithOverflow(
    allProcs: string[],
    allViews: string[]
  ): { procs: string[]; views: string[]; comment: string } {
    const uniqueProcs = [...new Set(allProcs)];
    const uniqueViews = [...new Set(allViews)];

    const procs = uniqueProcs.slice(0, 10);
    const views = uniqueViews.slice(0, 10);

    const comments: string[] = [];

    if (uniqueProcs.length > 10) {
      const overflow = uniqueProcs.slice(10);
      comments.push(`Additional Procs: ${overflow.join(', ')}`);
    }

    if (uniqueViews.length > 10) {
      const overflow = uniqueViews.slice(10);
      comments.push(`Additional Views: ${overflow.join(', ')}`);
    }

    return { procs, views, comment: comments.join('; ') };
  }

  /**
   * Format a single CSV row with Proc1-10, View1-10 columns
   */
  private formatPbiCsvRow(row: {
    reportType: string;
    reportName: string;
    reportPath: string;
    datasetName: string;
    datasetType: string;
    procs: string[];
    views: string[];
    comment: string;
    metadataTable: string;
    metadataSchema: string;
    sourceServer: string;
    sourceDatabase: string;
    status: string;
    hasPk: string;
  }): string {
    // Pad procs and views to 10 columns each
    const procCols: string[] = [];
    for (let i = 0; i < 10; i++) {
      procCols.push(this.escapeCsv(row.procs[i] || ''));
    }

    const viewCols: string[] = [];
    for (let i = 0; i < 10; i++) {
      viewCols.push(this.escapeCsv(row.views[i] || ''));
    }

    return [
      row.reportType,
      this.escapeCsv(row.reportName),
      this.escapeCsv(row.reportPath),
      this.escapeCsv(row.datasetName),
      this.escapeCsv(row.datasetType),
      ...procCols,
      ...viewCols,
      this.escapeCsv(row.comment),
      this.escapeCsv(row.metadataTable),
      this.escapeCsv(row.metadataSchema),
      this.escapeCsv(row.sourceServer),
      this.escapeCsv(row.sourceDatabase),
      this.escapeCsv(row.status),
      this.escapeCsv(row.hasPk),
    ].join(',') + '\n';
  }

  private escapeCsv(value: string | null): string {
    if (!value) return '';
    // Replace Unicode arrows and other special chars with ASCII equivalents
    let sanitized = value
      .replace(/→/g, '->')
      .replace(/←/g, '<-')
      .replace(/↔/g, '<->')
      .replace(/–/g, '-')  // en-dash
      .replace(/—/g, '--'); // em-dash

    if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
      return `"${sanitized.replace(/"/g, '""')}"`;
    }
    return sanitized;
  }

  /**
   * Get all external sources referenced by a report
   */
  getExternalSources(reportId: number): { source: string; database: string; schema: string; table: string; usedBy: string[] }[] {
    const tables = this.getSourceTables(reportId);

    // Collect all external sources and which PBI tables use them
    const sourceMap = new Map<string, Set<string>>();

    for (const table of tables) {
      if (table.externalSources) {
        for (const ext of table.externalSources) {
          if (!sourceMap.has(ext)) {
            sourceMap.set(ext, new Set());
          }
          sourceMap.get(ext)!.add(table.pbiTableName);
        }
      }
    }

    // Convert to array and extract database/schema/table
    const results: { source: string; database: string; schema: string; table: string; usedBy: string[] }[] = [];

    for (const [source, usedBySet] of sourceMap) {
      const parts = source.split('.');
      let database = '';
      let schema = '';
      let table = source;

      if (parts.length === 3) {
        // database.schema.table
        database = parts[0];
        schema = parts[1];
        table = parts[2];
      } else if (parts.length === 2) {
        // schema.table - first part is schema, database is unknown
        database = 'Unknown';
        schema = parts[0];
        table = parts[1];
      } else {
        database = 'Unknown';
        schema = '';
        table = parts[0];
      }

      results.push({
        source,
        database,
        schema,
        table,
        usedBy: [...usedBySet],
      });
    }

    // Sort by database, then source name
    results.sort((a, b) => {
      if (a.database !== b.database) return a.database.localeCompare(b.database);
      return a.source.localeCompare(b.source);
    });

    return results;
  }

  /**
   * Check if PBI data is loaded
   */
  getStatus(): { loaded: boolean; reportCount: number; tableCount: number } {
    const reportCount = this.repos.pbiReport.countAll();
    const tableCount = this.repos.pbiTable.countAll();

    return {
      loaded: reportCount > 0,
      reportCount,
      tableCount,
    };
  }
}
