import { Repositories } from '../repositories/index.js';
import { extractTables } from '../parsers/sql.analyzer.js';
import * as XLSX from 'xlsx';

// Represents a base table found through lineage tracing
interface BaseTableResult {
  database: string;
  schema: string;
  tableName: string;
  viewPath: string[];  // Chain of views traversed to reach this table
  procPath: string[];  // Chain of procs traversed to reach this table
  isExternal: boolean; // True if table not found in our metadata
  metadataServer: string;
  metadataDatabase: string;
  hasPk: string;       // 'Yes', 'No', or '-' if unknown
}

// Represents the full entity path to a table
interface EntityPathInfo {
  procs: string[];  // List of proc names in chain
  views: string[];  // List of view names in chain
}

export interface LineageExportRow {
  reportType: 'SSRS' | 'PowerBI';
  reportName: string;
  reportPath: string;
  datasetName: string;
  datasetType: string;
  // Proc1-Proc10
  procs: string[];
  // View1-View10
  views: string[];
  // Comment for overflow (more than 10 procs or views)
  comment: string;
  // Table info
  metadataTable: string;
  metadataSchema: string;
  // Linked Server info (for external tables)
  linkedServer: string;
  linkedServerDatabase: string;
  // In SQL2(D300SQLDW01) (Yes/No) - indicates if table was found in database metadata
  status: string;
  // SQL2(D300SQLDW01) Has PK (Yes/No/-)
  hasPk: string;
  // Available In New Syspro (Yes/No/-) - indicates if table exists in TRN1
  isAvailableInNewSyspro: string;
}

export class CsvExportService {
  constructor(private repos: Repositories) {}

  // Format entity name with schema prefix when available
  private formatNameWithSchema(name: string, schema: string | null): string {
    if (schema && schema.trim() !== '') {
      return `${schema}.${name}`;
    }
    return name;  // Return as-is when no schema
  }

  // Look up an object in TRN1 schema
  private findInTrn1(objectName: string): { found: boolean; schema: string | null } {
    const match = this.repos.trn1Schema.findByObjectName(objectName);
    if (match) {
      return { found: true, schema: match.schemaName };
    }
    return { found: false, schema: null };
  }

  // Get TRN1 availability status as string (includes schema if found)
  private getTrn1Status(tableName: string): string {
    const trn1Match = this.findInTrn1(tableName);
    if (trn1Match.found && trn1Match.schema) {
      return `Yes (${trn1Match.schema})`;
    }
    return trn1Match.found ? 'Yes' : 'No';
  }

  /**
   * Find all schemas where a table exists and format as comment
   * Returns comment showing all schemas if table exists in multiple schemas
   */
  private getSchemasComment(tableName: string): string {
    // Find all schemas where this table exists
    const schemas = this.repos.table.findAllSchemasForTable(tableName);

    if (schemas.length <= 1) {
      return ''; // Not in multiple schemas, no comment needed
    } else {
      // Found in multiple schemas - add comment
      return `Found in schemas: [${schemas.join(', ')}]`;
    }
  }

  /**
   * Export SSRS reports only
   */
  exportSsrs(): string {
    return this.buildCsv('SSRS');
  }

  /**
   * Export Power BI reports only
   */
  exportPbi(): string {
    return this.buildCsv('PowerBI');
  }

  /**
   * Export all reports (SSRS + Power BI combined)
   */
  exportAll(): string {
    return this.buildCsv('Both', false);
  }

  /**
   * Export all starred reports (starred SSRS + starred Power BI combined)
   */
  exportAllStarred(): string {
    return this.buildCsv('Both', true);
  }

  /**
   * Export custom tables (tables ending with '+') from starred reports
   * Shows whether each table exists in new Syspro (TRN1)
   */
  exportCustomTablesFromStarred(): string {
    const header = [
      'ReportName',
      'ReportPath',
      'Server',
      'Database',
      'Schema',
      'TableName',
      'HasPK',
      'AvailableInNewSyspro'
    ].join(',') + '\n';

    let csv = header;

    const customTables = this.repos.table.findCustomTablesFromStarredReports();

    for (const table of customTables) {
      const hasPk = table.hasPk === true ? 'Yes' : table.hasPk === false ? 'No' : '-';
      const trn1Status = this.getTrn1Status(table.tableName);

      csv += [
        this.escapeCsv(table.reportName),
        this.escapeCsv(table.reportPath),
        this.escapeCsv(table.server),
        this.escapeCsv(table.databaseName),
        this.escapeCsv(table.schemaName),
        this.escapeCsv(table.tableName),
        hasPk,
        trn1Status
      ].join(',') + '\n';
    }

    return csv;
  }

  private buildCsv(scope: 'SSRS' | 'PowerBI' | 'Both', starredOnly: boolean = false): string {
    // CSV header - matches old Excel format with additional columns
    // ReportType, ReportName, ReportPath, Proc1-Proc10, View1-View10, with Comment for overflow
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
      'Linked Server',
      'External Database',
      'In SQL2(D300SQLDW01)',
      'SQL2(D300SQLDW01) Has PK',
      'Available In New Syspro'
    ].join(',') + '\n';

    let csv = header;

    // Add SSRS data
    if (scope === 'SSRS' || scope === 'Both') {
      csv += this.getSsrsRows(starredOnly);
    }

    // Add Power BI data
    if (scope === 'PowerBI' || scope === 'Both') {
      csv += this.getPbiRows(starredOnly);
    }

    return csv;
  }

  /**
   * Get all SSRS report rows - one row per base table
   */
  private getSsrsRows(starredOnly: boolean = false): string {
    let rows = '';
    let reports = this.repos.report.findAll().filter((r) => r.status === 'COMPLETED');
    if (starredOnly) {
      reports = reports.filter((r) => r.starred === true);
    }

    // Process template reports
    for (const report of reports) {
      rows += this.getSsrsRowsForReport(
        report.id!,
        report.reportName || report.fileName,
        report.filePath || ''
      );
    }

    // Also process starred linked reports (they use their template's lineage)
    if (starredOnly) {
      const linkedReports = this.repos.linkedReport.findStarred();
      for (const linkedReport of linkedReports) {
        const templateReport = this.repos.report.findByFilePath(linkedReport.templatePath);
        if (templateReport && templateReport.status === 'COMPLETED') {
          rows += this.getSsrsRowsForReport(
            templateReport.id!,
            linkedReport.linkedReportName,
            linkedReport.linkedReportPath
          );
        }
      }
    }

    return rows;
  }

  /**
   * Generate rows for a single SSRS report (used by both template and linked reports)
   */
  private getSsrsRowsForReport(reportId: number, reportName: string, reportPath: string): string {
    let rows = '';
    const edges = this.repos.lineage.findByReportId(reportId);
    const datasets = this.repos.dataset.findByReportId(reportId);
    const datasetMap = new Map(datasets.map(ds => [ds.id, ds]));

    // Get all direct table edges (already resolved)
    const tableEdges = edges.filter(
      (e) => e.targetType === 'TABLE' || e.targetType === 'TABLE_NOT_FOUND'
    );

    // Get proc and view edges - need to trace these to base tables
    const procEdges = edges.filter((e) => e.targetType === 'PROC');
    const viewEdges = edges.filter((e) => e.targetType === 'VIEW');

    let hasAnyTables = false;

    // Process direct table references (from datasets with Text type)
    for (const edge of tableEdges) {
        hasAnyTables = true;
        const isNotFound = edge.targetType === 'TABLE_NOT_FOUND';
        let foundTable = edge.targetName || '';
        let foundSchema = '';
        let linkedServer = '';
        let linkedServerDatabase = '';

        let hasPk = '-';
        if (!isNotFound && edge.targetId > 0) {
          // First try lookup by ID
          let table = this.repos.table.findById(edge.targetId);
          // If not found by ID (stale reference), try by name
          if (!table && edge.targetName) {
            table = this.repos.table.findByName(edge.targetName);
          }
          if (table) {
            foundTable = table.tableName;
            foundSchema = table.schemaName || '';  // Fill in schema from database
            hasPk = table.hasPk === true ? 'Yes' : table.hasPk === false ? 'No' : '-';
          }
        } else {
          // Parse external table path to extract linked server info
          // Format: [LinkedServer->ActualServer].Database.Schema.Table
          // Or: Database.Schema.Table (cross-database)
          // Or: Schema.Table (local not found)
          const parsed = this.parseExternalTablePath(foundTable);
          foundTable = parsed.tableName;
          // Only set schema if it was explicitly in the path (linked server or cross-db)
          if (parsed.linkedServer || parsed.database) {
            foundSchema = parsed.schema;
          }
          linkedServer = parsed.linkedServer;
          linkedServerDatabase = parsed.database;
        }

        // Find the dataset for this edge
        const chain = this.buildEntityChain(edges, datasetMap, edge);

        // Add comment showing all schemas where table exists (if schema not specified)
        const schemasComment = this.getSchemasComment(foundTable);
        const finalComment = schemasComment
          ? (chain.comment ? `${chain.comment}; ${schemasComment}` : schemasComment)
          : chain.comment;

        rows += this.formatRow({
          reportType: 'SSRS',
          reportName: reportName,
          reportPath: reportPath,
          datasetName: chain.datasetName,
          datasetType: chain.datasetType,
          procs: chain.procs,
          views: chain.views,
          comment: finalComment,
          metadataTable: foundTable,
          metadataSchema: foundSchema,
          linkedServer,
          linkedServerDatabase,
          status: isNotFound ? 'No' : 'Yes',
          hasPk: hasPk,
          isAvailableInNewSyspro: this.getTrn1Status(foundTable),
        });
      }

      // Trace through VIEWs to find base tables
      for (const viewEdge of viewEdges) {
        if (!viewEdge.targetName) continue;

        const baseTables = this.findAllBaseTables(viewEdge.targetName, [], [], new Set());

        for (const bt of baseTables) {
          hasAnyTables = true;

          // Build the full path: get dataset info, then add procs from that path, then views
          const chain = this.buildEntityChain(edges, datasetMap, viewEdge);

          // Combine proc paths
          const allProcs = [...chain.procs, ...bt.procPath];
          // Combine view paths - viewEdge.targetName is the first view, then bt.viewPath has nested views
          // Look up view to get schema for proper formatting - try by ID first, then fall back to name
          let firstView = viewEdge.targetId > 0 ? this.repos.view.findById(viewEdge.targetId) : null;
          if (!firstView) firstView = this.repos.view.findByName(viewEdge.targetName);
          const firstViewName = firstView ? this.formatNameWithSchema(firstView.viewName, firstView.schemaName) : viewEdge.targetName;
          const allViews = [firstViewName, ...bt.viewPath];

          const { procs, views, comment } = this.splitPathsWithOverflow(allProcs, allViews);
          // Add comment for external tables not found in metadata
          let finalComment = bt.isExternal
            ? (comment ? `${comment}; Base table not in SQL2(D300SQLDW01) metadata` : 'Base table not in SQL2(D300SQLDW01) metadata')
            : comment;

          // Look up schema from database if not set
          let tableSchema = bt.schema;
          if (!tableSchema && !bt.isExternal) {
            const table = this.repos.table.findByName(bt.tableName);
            if (table) {
              tableSchema = table.schemaName || '';
            }
          }

          // Add schemas comment if table exists in multiple schemas
          const schemasComment = this.getSchemasComment(bt.tableName);
          if (schemasComment) {
            finalComment = finalComment ? `${finalComment}; ${schemasComment}` : schemasComment;
          }

          rows += this.formatRow({
            reportType: 'SSRS',
            reportName: reportName,
            reportPath: reportPath,
            datasetName: chain.datasetName,
            datasetType: chain.datasetType,
            procs,
            views,
            comment: finalComment,
            metadataTable: bt.tableName,
            metadataSchema: tableSchema,
            linkedServer: '',
            linkedServerDatabase: bt.isExternal ? bt.database : '',
            status: bt.isExternal ? 'No' : 'Yes',
            hasPk: bt.hasPk,
            isAvailableInNewSyspro: this.getTrn1Status(bt.tableName),
          });
        }
      }

      // Trace through PROCs to find base tables
      for (const procEdge of procEdges) {
        if (!procEdge.targetName) continue;

        const { tables, procPath } = this.findTablesFromProc(procEdge.targetName, new Set());

        // Look up proc to get schema for proper formatting - try by ID first, then fall back to name
        let firstProc = procEdge.targetId > 0 ? this.repos.storedProc.findById(procEdge.targetId) : null;
        if (!firstProc) firstProc = this.repos.storedProc.findByName(procEdge.targetName);
        const firstProcName = firstProc ? this.formatNameWithSchema(firstProc.procName, firstProc.schemaName) : procEdge.targetName;

        for (const bt of tables) {
          hasAnyTables = true;

          // Build the full path from dataset to this proc
          const chain = this.buildEntityChain(edges, datasetMap, procEdge);

          // Combine all procs: from dataset chain + procPath from tracing
          const allProcs = [...chain.procs, firstProcName, ...bt.procPath.filter(p => p.toLowerCase() !== firstProcName.toLowerCase())];
          // Add any views from the table tracing
          const allViews = [...chain.views, ...bt.viewPath];

          const { procs, views, comment } = this.splitPathsWithOverflow(allProcs, allViews);
          // Add comment for external tables not found in metadata
          let finalComment = bt.isExternal
            ? (comment ? `${comment}; Base table not in SQL2(D300SQLDW01) metadata` : 'Base table not in SQL2(D300SQLDW01) metadata')
            : comment;

          // Look up schema from database if not set
          let tableSchema = bt.schema;
          if (!tableSchema && !bt.isExternal) {
            const table = this.repos.table.findByName(bt.tableName);
            if (table) {
              tableSchema = table.schemaName || '';
            }
          }

          // Add schemas comment if table exists in multiple schemas
          const schemasComment = this.getSchemasComment(bt.tableName);
          if (schemasComment) {
            finalComment = finalComment ? `${finalComment}; ${schemasComment}` : schemasComment;
          }

          rows += this.formatRow({
            reportType: 'SSRS',
            reportName: reportName,
            reportPath: reportPath,
            datasetName: chain.datasetName,
            datasetType: chain.datasetType,
            procs,
            views,
            comment: finalComment,
            metadataTable: bt.tableName,
            metadataSchema: tableSchema,
            linkedServer: '',
            linkedServerDatabase: bt.isExternal ? bt.database : '',
            status: bt.isExternal ? 'No' : 'Yes',
            hasPk: bt.hasPk,
            isAvailableInNewSyspro: this.getTrn1Status(bt.tableName),
          });
        }
      }

      // If no tables found at all, output a single row indicating this
      if (!hasAnyTables) {
        for (const ds of datasets) {
          rows += this.formatRow({
            reportType: 'SSRS',
            reportName: reportName,
            reportPath: reportPath,
            datasetName: ds.datasetName,
            datasetType: ds.commandType || '',
            procs: [],
            views: [],
            comment: '',
            metadataTable: 'No table references found',
            metadataSchema: '',
            linkedServer: '',
            linkedServerDatabase: '',
            status: 'NO TABLES',
            hasPk: '-',
            isAvailableInNewSyspro: '-',
          });
        }
        if (datasets.length === 0) {
          rows += this.formatRow({
            reportType: 'SSRS',
            reportName: reportName,
            reportPath: reportPath,
            datasetName: '',
            datasetType: '',
            procs: [],
            views: [],
            comment: '',
            metadataTable: 'No datasets in report',
            metadataSchema: '',
            linkedServer: '',
            linkedServerDatabase: '',
            status: 'NO TABLES',
            hasPk: '-',
            isAvailableInNewSyspro: '-',
          });
        }
      }

    return rows;
  }

  /**
   * Get starred Power BI rows (public method for use by routes)
   */
  getStarredPbiRows(): string {
    return this.getPbiRows(true);
  }

  /**
   * Get all Power BI report rows - one row per base table
   */
  private getPbiRows(starredOnly: boolean = false): string {
    let rows = '';
    let reports = this.repos.pbiReport.findAll();
    if (starredOnly) {
      reports = reports.filter((r) => r.starred === true);
    }

    for (const report of reports) {
      const tables = this.repos.pbiTable.findByReportId(report.id!);

      if (tables.length === 0) {
        rows += this.formatRow({
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
          linkedServer: '',
          linkedServerDatabase: '',
          status: 'NO TABLES',
          hasPk: '-',
          isAvailableInNewSyspro: '-',
        });
        continue;
      }

      for (const pbiTable of tables) {
        const excelRef = pbiTable.sourceViewOrTable || '';

        if (!excelRef) {
          rows += this.formatRow({
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
            linkedServer: '',
            linkedServerDatabase: '',
            status: 'NO SOURCE',
            hasPk: '-',
            isAvailableInNewSyspro: '-',
          });
          continue;
        }

        // Check if it's directly a table
        const directTable = this.repos.table.findByName(excelRef);
        if (directTable) {
          rows += this.formatRow({
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
            linkedServer: '',
            linkedServerDatabase: '',
            status: 'Yes',
            hasPk: directTable.hasPk === true ? 'Yes' : directTable.hasPk === false ? 'No' : '-',
            isAvailableInNewSyspro: this.getTrn1Status(directTable.tableName),
          });
          continue;
        }

        // Check if it's a view - trace to base tables
        const view = this.repos.view.findByName(excelRef);
        if (view) {
          const baseTables = this.findAllBaseTables(excelRef, [], [], new Set());

          if (baseTables.length === 0) {
            // View exists but has no traceable tables
            rows += this.formatRow({
              reportType: 'PowerBI',
              reportName: report.reportName,
              reportPath: '',
              datasetName: pbiTable.tableName,
              datasetType: 'PowerBI',
              procs: [],
              views: [this.formatNameWithSchema(view.viewName, view.schemaName)],
              comment: '',
              metadataTable: 'No base tables found in view',
              metadataSchema: view.schemaName || '',
              linkedServer: '',
              linkedServerDatabase: '',
              status: 'VIEW_NO_TABLES',
              hasPk: '-',
              isAvailableInNewSyspro: '-',
            });
            continue;
          }

          // Output one row per base table found
          for (const bt of baseTables) {
            const allViews = [excelRef, ...bt.viewPath];
            const { procs, views, comment } = this.splitPathsWithOverflow(bt.procPath, allViews);
            // Add comment for external tables not found in metadata
            const finalComment = bt.isExternal
              ? (comment ? `${comment}; Base table not in SQL2(D300SQLDW01) metadata` : 'Base table not in SQL2(D300SQLDW01) metadata')
              : comment;

            // Look up schema from database if not set
            let tableSchema = bt.schema;
            if (!tableSchema && !bt.isExternal) {
              const table = this.repos.table.findByName(bt.tableName);
              if (table) {
                tableSchema = table.schemaName || '';
              }
            }

            rows += this.formatRow({
              reportType: 'PowerBI',
              reportName: report.reportName,
              reportPath: '',
              datasetName: pbiTable.tableName,
              datasetType: 'PowerBI',
              procs,
              views,
              comment: finalComment,
              metadataTable: bt.tableName,
              metadataSchema: tableSchema,
              linkedServer: '',
              linkedServerDatabase: bt.isExternal ? bt.database : '',
              status: bt.isExternal ? 'No' : 'Yes',
              hasPk: bt.hasPk,
              isAvailableInNewSyspro: this.getTrn1Status(bt.tableName),
            });
          }
        } else {
          // Not found as table or view
          const parts = excelRef.split('.');
          let notFoundSchema = '';
          let notFoundTable = excelRef;
          if (parts.length >= 2) {
            notFoundSchema = parts[parts.length - 2];
            notFoundTable = parts[parts.length - 1];
          }

          rows += this.formatRow({
            reportType: 'PowerBI',
            reportName: report.reportName,
            reportPath: '',
            datasetName: pbiTable.tableName,
            datasetType: 'PowerBI',
            procs: [],
            views: [],
            comment: `View not in SQL2(D300SQLDW01) metadata: ${excelRef}`,
            metadataTable: notFoundTable,
            metadataSchema: notFoundSchema,
            linkedServer: '',
            linkedServerDatabase: '',
            status: 'No',
            hasPk: '-',
            isAvailableInNewSyspro: this.getTrn1Status(notFoundTable),
          });
        }
      }
    }

    return rows;
  }

  /**
   * Build the chain of procs/views from dataset to a given edge
   */
  private buildEntityChain(
    edges: any[],
    datasetMap: Map<number | null, any>,
    targetEdge: any
  ): { datasetName: string; datasetType: string; procs: string[]; views: string[]; comment: string } {
    const result = { datasetName: '', datasetType: '', procs: [] as string[], views: [] as string[], comment: '' };

    // Build a lookup map from target to source edges
    const edgesByTarget = new Map<string, any[]>();
    for (const e of edges) {
      const key = `${e.targetType}:${e.targetId}:${e.targetName}`;
      if (!edgesByTarget.has(key)) edgesByTarget.set(key, []);
      edgesByTarget.get(key)!.push(e);
    }

    // Walk backwards from the target edge to the dataset
    let currentType = targetEdge.sourceType;
    let currentName = targetEdge.sourceName;
    let currentId = targetEdge.sourceId;
    const visited = new Set<string>();
    const procList: string[] = [];
    const viewList: string[] = [];

    while (currentType && currentName) {
      const key = `${currentType}:${currentId}:${currentName}`;
      if (visited.has(key)) break;
      visited.add(key);

      if (currentType === 'VIEW') {
        // Look up view to get schema - try by ID first, then fall back to name
        // (IDs can become stale after metadata reload)
        let view = currentId > 0 ? this.repos.view.findById(currentId) : null;
        if (!view) view = this.repos.view.findByName(currentName);
        const displayName = view ? this.formatNameWithSchema(view.viewName, view.schemaName) : currentName;
        viewList.unshift(displayName);
      } else if (currentType === 'PROC') {
        // Look up proc to get schema - try by ID first, then fall back to name
        // (IDs can become stale after metadata reload)
        let proc = currentId > 0 ? this.repos.storedProc.findById(currentId) : null;
        if (!proc) proc = this.repos.storedProc.findByName(currentName);
        const displayName = proc ? this.formatNameWithSchema(proc.procName, proc.schemaName) : currentName;
        procList.unshift(displayName);
      } else if (currentType === 'DATASET') {
        const ds = datasetMap.get(currentId);
        if (ds) {
          result.datasetName = ds.datasetName;
          result.datasetType = ds.commandType || '';
        }
        break;
      } else if (currentType === 'SHARED_DATASET') {
        result.datasetType = 'SharedDataSet';
      }

      // Find the edge that points to the current node
      const incomingKey = `${currentType}:${currentId}:${currentName}`;
      const incomingEdges = edgesByTarget.get(incomingKey) || [];
      if (incomingEdges.length === 0) break;

      const incoming = incomingEdges[0];
      currentType = incoming.sourceType;
      currentName = incoming.sourceName || '';
      currentId = incoming.sourceId;
    }

    const split = this.splitPathsWithOverflow(procList, viewList);
    result.procs = split.procs;
    result.views = split.views;
    result.comment = split.comment;

    return result;
  }

  /**
   * Split procs and views into max 10 each, with overflow going to comment
   */
  private splitPathsWithOverflow(
    allProcs: string[],
    allViews: string[]
  ): { procs: string[]; views: string[]; comment: string } {
    // Deduplicate while preserving order
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
   * Recursively find ALL base tables from a view
   * Returns one entry per base table found, with the path taken to get there
   */
  private findAllBaseTables(
    viewName: string,
    currentViewPath: string[],
    currentProcPath: string[],
    visited: Set<string>
  ): BaseTableResult[] {
    const lowerName = viewName.toLowerCase();
    if (visited.has(lowerName)) return [];
    visited.add(lowerName);
    if (visited.size > 50) return []; // Safety limit

    const view = this.repos.view.findByName(viewName);
    if (!view || !view.definition) return [];

    // Add current view to visited (only full name to avoid false matches across schemas)
    const fullName = `${view.schemaName}.${view.viewName}`;
    visited.add(fullName.toLowerCase());

    const results: BaseTableResult[] = [];
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

      // Skip if already visited (use full schema.name to avoid false matches)
      if (visited.has(lookupName.toLowerCase())) continue;

      // Check if it's another view - recurse
      const nestedView = this.repos.view.findByName(lookupName);
      if (nestedView) {
        const nestedFullName = `${nestedView.schemaName}.${nestedView.viewName}`;
        const newViewPath = [...currentViewPath, nestedFullName];
        const deeper = this.findAllBaseTables(nestedFullName, newViewPath, currentProcPath, visited);
        results.push(...deeper);
        continue;
      }

      // Check if it's a table in our metadata
      const table = this.repos.table.findByName(lookupName);
      if (table) {
        results.push({
          database: table.databaseName || refDatabase,
          schema: refSchema,  // Keep original schema from SQL (blank if not specified)
          tableName: table.tableName,
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
          database: refDatabase || '',
          schema: refSchema,
          tableName: ref.tableName,
          viewPath: currentViewPath,
          procPath: currentProcPath,
          isExternal: true,
          metadataServer: '',
          metadataDatabase: refDatabase,
          hasPk: '-',
        });
      }
    }

    return results;
  }

  /**
   * Find all base tables from a stored procedure
   * Also returns the proc call chain
   */
  private findTablesFromProc(
    procName: string,
    visited: Set<string>
  ): { tables: BaseTableResult[]; procPath: string[] } {
    const lowerName = procName.toLowerCase();
    if (visited.has(lowerName)) return { tables: [], procPath: [] };
    visited.add(lowerName);
    if (visited.size > 50) return { tables: [], procPath: [] };

    const proc = this.repos.storedProc.findByName(procName);
    if (!proc || !proc.definition) return { tables: [], procPath: [] };

    const fullProcName = `${proc.schemaName}.${proc.procName}`;
    visited.add(fullProcName.toLowerCase());

    const results: BaseTableResult[] = [];
    const procPath: string[] = [];

    // Extract table references from proc
    const tableRefs = extractTables(proc.definition);

    for (const ref of tableRefs) {
      let lookupName = ref.tableName;
      let refDatabase = ref.database || '';
      let refSchema = ref.schema || '';

      if (ref.schema) {
        lookupName = `${ref.schema}.${ref.tableName}`;
      }

      // Check if it's a view - trace through it
      const nestedView = this.repos.view.findByName(lookupName);
      if (nestedView) {
        const viewFullName = `${nestedView.schemaName}.${nestedView.viewName}`;
        const viewTables = this.findAllBaseTables(viewFullName, [viewFullName], procPath, visited);
        results.push(...viewTables);
        continue;
      }

      // Check if it's a table
      const table = this.repos.table.findByName(lookupName);
      if (table) {
        results.push({
          database: table.databaseName || refDatabase,
          schema: refSchema,  // Keep original schema from SQL (blank if not specified)
          tableName: table.tableName,
          viewPath: [],
          procPath: procPath,
          isExternal: false,
          metadataServer: table.server || '',
          metadataDatabase: table.databaseName || '',
          hasPk: table.hasPk === true ? 'Yes' : table.hasPk === false ? 'No' : '-',
        });
      } else {
        // External or not found
        results.push({
          database: refDatabase || '',
          schema: refSchema,
          tableName: ref.tableName,
          viewPath: [],
          procPath: procPath,
          isExternal: true,
          metadataServer: '',
          metadataDatabase: refDatabase,
          hasPk: '-',
        });
      }
    }

    // Check for EXEC calls to other procs
    const execPattern = /EXEC(?:UTE)?\s+(?:\[?(\w+)\]?\.)?\[?(\w+)\]?/gi;
    let match;
    while ((match = execPattern.exec(proc.definition)) !== null) {
      const calledProc = match[2];
      if (calledProc && calledProc.toLowerCase() !== procName.toLowerCase()) {
        const nested = this.findTablesFromProc(calledProc, visited);
        results.push(...nested.tables);
        if (nested.procPath.length > 0) {
          procPath.push(...nested.procPath);
        }
      }
    }

    return { tables: results, procPath };
  }

  /**
   * Parse external table path to extract linked server, database, schema, and table name
   * Format: [LinkedServer->ActualServer].Database.Schema.Table
   * Or: Database.Schema.Table (cross-database)
   * Or: Schema.Table (local not found)
   * Or: @DYNAMIC.Schema.Table (dynamic SQL)
   */
  private parseExternalTablePath(fullPath: string): {
    linkedServer: string;
    database: string;
    schema: string;
    tableName: string;
  } {
    let linkedServer = '';
    let database = '';
    let schema = '';
    let tableName = fullPath;

    // Check for linked server pattern: [Server->ActualServer].Database.Schema.Table
    const linkedServerMatch = fullPath.match(/^\[([^\]]+)\]\.(.+)$/);
    if (linkedServerMatch) {
      linkedServer = linkedServerMatch[1]; // e.g., "SYSPRO->SUN300DSYSSQL01"
      const remaining = linkedServerMatch[2]; // e.g., "SysproCustomizations.dbo.ApPayRunRevision"
      const parts = remaining.split('.');
      if (parts.length >= 3) {
        database = parts[0];
        schema = parts[1];
        tableName = parts.slice(2).join('.'); // Handle table names with dots
      } else if (parts.length === 2) {
        schema = parts[0];
        tableName = parts[1];
      } else {
        tableName = remaining;
      }
    } else if (fullPath.startsWith('@DYNAMIC.')) {
      // Dynamic SQL: @DYNAMIC.Schema.Table
      linkedServer = '@DYNAMIC';
      const parts = fullPath.substring(9).split('.'); // Remove "@DYNAMIC."
      if (parts.length >= 2) {
        schema = parts[0];
        tableName = parts.slice(1).join('.');
      } else {
        tableName = parts[0] || fullPath;
      }
    } else {
      // Regular path: Database.Schema.Table or Schema.Table
      const parts = fullPath.split('.');
      if (parts.length >= 3) {
        // Database.Schema.Table (cross-database)
        database = parts[0];
        schema = parts[1];
        tableName = parts.slice(2).join('.');
      } else if (parts.length === 2) {
        // Schema.Table
        schema = parts[0];
        tableName = parts[1];
      }
      // else: just table name, keep as is
    }

    return { linkedServer, database, schema, tableName };
  }

  private formatRow(row: LineageExportRow): string {
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
      this.escapeCsv(row.reportPath || ''),
      this.escapeCsv(row.datasetName),
      this.escapeCsv(row.datasetType),
      ...procCols,
      ...viewCols,
      this.escapeCsv(row.comment),
      this.escapeCsv(row.metadataTable),
      this.escapeCsv(row.metadataSchema),
      this.escapeCsv(row.linkedServer || ''),
      this.escapeCsv(row.linkedServerDatabase || ''),
      this.escapeCsv(row.status),
      this.escapeCsv(row.hasPk),
      this.escapeCsv(row.isAvailableInNewSyspro || '-'),
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
   * Check if a table name is a custom table (ends with "+")
   */
  private isCustomTable(tableName: string): boolean {
    return tableName.endsWith('+');
  }

  /**
   * Get custom tables from an SSRS report's lineage (tables ending with "+")
   */
  private getCustomTablesFromReport(reportId: number): Array<{ schema: string; tableName: string }> {
    const edges = this.repos.lineage.findByReportId(reportId);
    const tables: Array<{ schema: string; tableName: string }> = [];
    const seen = new Set<string>();

    // Direct TABLE edges
    const tableEdges = edges.filter((e) => e.targetType === 'TABLE' || e.targetType === 'TABLE_NOT_FOUND');
    for (const edge of tableEdges) {
      let tableName = '';
      let schema = '';
      if (edge.targetId > 0) {
        const table = this.repos.table.findById(edge.targetId);
        if (table) {
          tableName = table.tableName;
          schema = table.schemaName || '';
        }
      } else if (edge.targetName) {
        // Parse table name from path
        const parsed = this.parseExternalTablePath(edge.targetName);
        tableName = parsed.tableName;
        schema = parsed.schema || '';
      }

      if (tableName && this.isCustomTable(tableName)) {
        const key = `${schema}.${tableName}`.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          tables.push({ schema, tableName });
        }
      }
    }

    // Tables from VIEW edges (trace through views)
    const viewEdges = edges.filter((e) => e.targetType === 'VIEW');
    for (const viewEdge of viewEdges) {
      if (!viewEdge.targetName) continue;
      const baseTables = this.findAllBaseTables(viewEdge.targetName, [], [], new Set());
      for (const bt of baseTables) {
        if (this.isCustomTable(bt.tableName)) {
          const key = `${bt.schema}.${bt.tableName}`.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            tables.push({ schema: bt.schema || '', tableName: bt.tableName });
          }
        }
      }
    }

    // Tables from PROC edges (trace through procs)
    const procEdges = edges.filter((e) => e.targetType === 'PROC');
    for (const procEdge of procEdges) {
      if (!procEdge.targetName) continue;
      const { tables: procTables } = this.findTablesFromProc(procEdge.targetName, new Set());
      for (const bt of procTables) {
        if (this.isCustomTable(bt.tableName)) {
          const key = `${bt.schema}.${bt.tableName}`.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            tables.push({ schema: bt.schema || '', tableName: bt.tableName });
          }
        }
      }
    }

    return tables;
  }

  /**
   * Get custom tables from a Power BI report (tables ending with "+")
   */
  private getCustomTablesFromPbiReport(reportId: number): Array<{ schema: string; tableName: string }> {
    const pbiTables = this.repos.pbiTable.findByReportId(reportId);
    const tables: Array<{ schema: string; tableName: string }> = [];
    const seen = new Set<string>();

    for (const pbiTable of pbiTables) {
      const excelRef = pbiTable.sourceViewOrTable || '';
      if (!excelRef) continue;

      // Check if it's directly a table
      const directTable = this.repos.table.findByName(excelRef);
      if (directTable && this.isCustomTable(directTable.tableName)) {
        const key = `${directTable.schemaName}.${directTable.tableName}`.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          tables.push({ schema: directTable.schemaName || '', tableName: directTable.tableName });
        }
        continue;
      }

      // Check if it's a view - trace to base tables
      const view = this.repos.view.findByName(excelRef);
      if (view) {
        const baseTables = this.findAllBaseTables(excelRef, [], [], new Set());
        for (const bt of baseTables) {
          if (this.isCustomTable(bt.tableName)) {
            const key = `${bt.schema}.${bt.tableName}`.toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              tables.push({ schema: bt.schema || '', tableName: bt.tableName });
            }
          }
        }
      }
    }

    return tables;
  }

  /**
   * Export unique custom tables by report as CSV
   * Columns: Report Name, Schema, Custom Table, Type (SSRS/PowerBI), Report Path
   */
  exportCustomTablesByReport(scope: 'SSRS' | 'PowerBI' | 'Both', starredOnly: boolean = false): string {
    const header = ['Report Name', 'Schema', 'Custom Table', 'Type', 'Report Path'].join(',') + '\n';
    let csv = header;

    const customTablesByReport: Array<{
      reportName: string;
      schema: string;
      customTable: string;
      reportType: 'SSRS' | 'PowerBI';
      reportPath: string;
    }> = [];

    // Process SSRS reports
    if (scope === 'SSRS' || scope === 'Both') {
      let reports = this.repos.report.findAll().filter((r) => r.status === 'COMPLETED');
      if (starredOnly) {
        reports = reports.filter((r) => r.starred === true);
      }

      for (const report of reports) {
        const customTables = this.getCustomTablesFromReport(report.id!);
        for (const table of customTables) {
          customTablesByReport.push({
            reportName: report.reportName || report.fileName,
            schema: table.schema,
            customTable: table.tableName,
            reportType: 'SSRS',
            reportPath: report.filePath || '',
          });
        }
      }
    }

    // Process Power BI reports
    if (scope === 'PowerBI' || scope === 'Both') {
      let reports = this.repos.pbiReport.findAll();
      if (starredOnly) {
        reports = reports.filter((r) => r.starred === true);
      }

      for (const report of reports) {
        const customTables = this.getCustomTablesFromPbiReport(report.id!);
        for (const table of customTables) {
          customTablesByReport.push({
            reportName: report.reportName,
            schema: table.schema,
            customTable: table.tableName,
            reportType: 'PowerBI',
            reportPath: '',
          });
        }
      }
    }

    // Deduplicate per report (same schema.table can appear once per report)
    const seenPerReport = new Set<string>();
    for (const row of customTablesByReport) {
      const key = `${row.reportName.toLowerCase()}|${row.schema.toLowerCase()}|${row.customTable.toLowerCase()}`;
      if (!seenPerReport.has(key)) {
        seenPerReport.add(key);
        csv += [
          this.escapeCsv(row.reportName),
          this.escapeCsv(row.schema),
          this.escapeCsv(row.customTable),
          row.reportType,
          this.escapeCsv(row.reportPath)
        ].join(',') + '\n';
      }
    }

    return csv;
  }

  /**
   * Export unique custom tables as CSV (schema and table names, no report info)
   * Columns: Schema, Custom Table
   */
  exportUniqueCustomTables(scope: 'SSRS' | 'PowerBI' | 'Both', starredOnly: boolean = false): string {
    const header = 'Schema,Custom Table\n';
    let csv = header;

    const allCustomTables = new Map<string, { schema: string; tableName: string }>();

    // Process SSRS reports
    if (scope === 'SSRS' || scope === 'Both') {
      let reports = this.repos.report.findAll().filter((r) => r.status === 'COMPLETED');
      if (starredOnly) {
        reports = reports.filter((r) => r.starred === true);
      }

      for (const report of reports) {
        const customTables = this.getCustomTablesFromReport(report.id!);
        for (const table of customTables) {
          const key = `${table.schema}.${table.tableName}`.toLowerCase();
          if (!allCustomTables.has(key)) {
            allCustomTables.set(key, { schema: table.schema, tableName: table.tableName });
          }
        }
      }
    }

    // Process Power BI reports
    if (scope === 'PowerBI' || scope === 'Both') {
      let reports = this.repos.pbiReport.findAll();
      if (starredOnly) {
        reports = reports.filter((r) => r.starred === true);
      }

      for (const report of reports) {
        const customTables = this.getCustomTablesFromPbiReport(report.id!);
        for (const table of customTables) {
          const key = `${table.schema}.${table.tableName}`.toLowerCase();
          if (!allCustomTables.has(key)) {
            allCustomTables.set(key, { schema: table.schema, tableName: table.tableName });
          }
        }
      }
    }

    // Sort by schema.tableName and output
    const sortedTables = Array.from(allCustomTables.values()).sort((a, b) => {
      const aKey = `${a.schema}.${a.tableName}`.toLowerCase();
      const bKey = `${b.schema}.${b.tableName}`.toLowerCase();
      return aKey.localeCompare(bKey);
    });

    for (const table of sortedTables) {
      csv += `${this.escapeCsv(table.schema)},${this.escapeCsv(table.tableName)}\n`;
    }

    return csv;
  }

  /**
   * Export as Excel workbook with 3 sheets:
   * 1. Lineage - Full lineage data
   * 2. Unique Custom Tables by Report - Custom tables (ending with "+") per report
   * 3. Unique Custom Tables - Just unique custom table names
   */
  exportAsExcel(scope: 'SSRS' | 'PowerBI' | 'Both', starredOnly: boolean = false): Buffer {
    // Create workbook
    const wb = XLSX.utils.book_new();

    // Sheet 1: Lineage (existing CSV data converted to sheet)
    const lineageData = this.getLineageData(scope, starredOnly);
    const lineageSheet = XLSX.utils.aoa_to_sheet(lineageData);
    XLSX.utils.book_append_sheet(wb, lineageSheet, 'Lineage');

    // Collect custom tables by report
    const customTablesByReport: Array<{
      reportName: string;
      customTable: string;
      reportType: 'SSRS' | 'PowerBI';
      reportPath: string;
    }> = [];

    // Process SSRS reports
    if (scope === 'SSRS' || scope === 'Both') {
      let reports = this.repos.report.findAll().filter((r) => r.status === 'COMPLETED');
      if (starredOnly) {
        reports = reports.filter((r) => r.starred === true);
      }

      for (const report of reports) {
        const customTables = this.getCustomTablesFromReport(report.id!);
        for (const table of customTables) {
          customTablesByReport.push({
            reportName: report.reportName || report.fileName,
            customTable: table.tableName,
            reportType: 'SSRS',
            reportPath: report.filePath || '',
          });
        }
      }
    }

    // Process Power BI reports
    if (scope === 'PowerBI' || scope === 'Both') {
      let reports = this.repos.pbiReport.findAll();
      if (starredOnly) {
        reports = reports.filter((r) => r.starred === true);
      }

      for (const report of reports) {
        const customTables = this.getCustomTablesFromPbiReport(report.id!);
        for (const table of customTables) {
          customTablesByReport.push({
            reportName: report.reportName,
            customTable: table.tableName,
            reportType: 'PowerBI',
            reportPath: '',
          });
        }
      }
    }

    // Sheet 2: Unique Custom Tables by Report
    const sheet2Header = ['Report Name', 'Custom Table', 'Type', 'Report Path'];
    const sheet2Data = [sheet2Header];

    // Deduplicate per report (same table can appear once per report)
    const seenPerReport = new Set<string>();
    for (const row of customTablesByReport) {
      const key = `${row.reportName.toLowerCase()}|${row.customTable.toLowerCase()}`;
      if (!seenPerReport.has(key)) {
        seenPerReport.add(key);
        sheet2Data.push([row.reportName, row.customTable, row.reportType, row.reportPath]);
      }
    }

    const sheet2 = XLSX.utils.aoa_to_sheet(sheet2Data);
    XLSX.utils.book_append_sheet(wb, sheet2, 'Unique Custom Tables by Report');

    // Sheet 3: Unique Custom Tables (just table names)
    const sheet3Header = ['Custom Table'];
    const sheet3Data = [sheet3Header];

    const uniqueTables = new Set<string>();
    for (const row of customTablesByReport) {
      const key = row.customTable.toLowerCase();
      if (!uniqueTables.has(key)) {
        uniqueTables.add(key);
        sheet3Data.push([row.customTable]);
      }
    }

    const sheet3 = XLSX.utils.aoa_to_sheet(sheet3Data);
    XLSX.utils.book_append_sheet(wb, sheet3, 'Unique Custom Tables');

    // Write to buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
  }

  /**
   * Get lineage data as array of arrays (for Excel sheet)
   */
  private getLineageData(scope: 'SSRS' | 'PowerBI' | 'Both', starredOnly: boolean = false): string[][] {
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
      'Linked Server',
      'External Database',
      'In SQL2(D300SQLDW01)',
      'SQL2(D300SQLDW01) Has PK',
      'Available In New Syspro'
    ];

    const data: string[][] = [header];

    // Build CSV string then parse it back - reuses existing logic
    let csvContent = '';
    if (scope === 'SSRS' || scope === 'Both') {
      csvContent += this.getSsrsRows(starredOnly);
    }
    if (scope === 'PowerBI' || scope === 'Both') {
      csvContent += this.getPbiRows(starredOnly);
    }

    // Parse CSV rows into arrays
    if (csvContent) {
      const lines = csvContent.trim().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          // Simple CSV parsing (handles quoted values)
          const row = this.parseCsvLine(line);
          data.push(row);
        }
      }
    }

    return data;
  }

  /**
   * Parse a CSV line into an array of values (handles quoted values with commas)
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // Skip the escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current); // Don't forget the last field
    return result;
  }

  /**
   * Export report-to-table mapping from starred reports
   * Shows which tables each starred report uses
   */
  exportReportTableMapping(): string {
    const header = [
      'ReportType',
      'ReportName',
      'ReportPath',
      'TableSchema',
      'TableName'
    ].join(',') + '\n';

    let csv = header;

    // Process starred SSRS template reports
    const ssrsReports = this.repos.report.findStarred();
    const completedSsrs = ssrsReports.filter((r) => r.status === 'COMPLETED');

    for (const report of completedSsrs) {
      const tables = this.getUniqueTablesFromReport(report.id!);
      for (const table of tables) {
        csv += [
          'SSRS',
          this.escapeCsv(report.reportName || report.fileName),
          this.escapeCsv(report.filePath || ''),
          this.escapeCsv(table.schema),
          this.escapeCsv(table.tableName)
        ].join(',') + '\n';
      }
    }

    // Process starred linked reports (SSRS linked reports that point to templates)
    const linkedReports = this.repos.linkedReport.findStarred();
    for (const linkedReport of linkedReports) {
      // Find the template report to get lineage data
      const templateReport = this.repos.report.findByFilePath(linkedReport.templatePath);
      if (templateReport && templateReport.status === 'COMPLETED') {
        const tables = this.getUniqueTablesFromReport(templateReport.id!);
        for (const table of tables) {
          csv += [
            'SSRS',
            this.escapeCsv(linkedReport.linkedReportName),
            this.escapeCsv(linkedReport.linkedReportPath),
            this.escapeCsv(table.schema),
            this.escapeCsv(table.tableName)
          ].join(',') + '\n';
        }
      }
    }

    // Process starred Power BI reports
    const pbiReports = this.repos.pbiReport.findAll().filter((r) => r.starred === true);

    for (const report of pbiReports) {
      const tables = this.getUniqueTablesFromPbiReport(report.id!);
      for (const table of tables) {
        csv += [
          'PowerBI',
          this.escapeCsv(report.reportName),
          '',
          this.escapeCsv(table.schema),
          this.escapeCsv(table.tableName)
        ].join(',') + '\n';
      }
    }

    return csv;
  }

  /**
   * Export unique table columns from starred reports
   * Gets unique tables across all starred SSRS and Power BI reports,
   * then exports column details from both SQL2 and TRN1 databases (deduplicated)
   */
  exportUniqueTableColumns(): string {
    const header = [
      'Schema_In_Report',
      'TableName',
      'ColumnName',
      'InNewSyspro_TRN1',
      'NewSyspro_TRN1_DataType',
      'NewSyspro_TRN1_MaxLength',
      'NewSyspro_TRN1_Nullable',
      'InSQL2',
      'SQL2_Schema',
      'SQL2_DataType',
      'SQL2_MaxLength',
      'SQL2_Nullable'
    ].join(',') + '\n';

    let csv = header;

    // Collect all unique tables across all starred reports
    const allTables = new Map<string, { schema: string; tableName: string }>();

    // Process starred SSRS template reports
    const ssrsReports = this.repos.report.findStarred();
    const completedSsrs = ssrsReports.filter((r) => r.status === 'COMPLETED');

    for (const report of completedSsrs) {
      const tables = this.getUniqueTablesFromReport(report.id!);
      for (const table of tables) {
        const key = `${table.schema}.${table.tableName}`.toLowerCase();
        if (!allTables.has(key)) {
          allTables.set(key, table);
        }
      }
    }

    // Process starred linked reports (get tables from their template reports)
    const linkedReports = this.repos.linkedReport.findStarred();
    for (const linkedReport of linkedReports) {
      const templateReport = this.repos.report.findByFilePath(linkedReport.templatePath);
      if (templateReport && templateReport.status === 'COMPLETED') {
        const tables = this.getUniqueTablesFromReport(templateReport.id!);
        for (const table of tables) {
          const key = `${table.schema}.${table.tableName}`.toLowerCase();
          if (!allTables.has(key)) {
            allTables.set(key, table);
          }
        }
      }
    }

    // Process starred Power BI reports
    const pbiReports = this.repos.pbiReport.findAll().filter((r) => r.starred === true);

    for (const report of pbiReports) {
      const tables = this.getUniqueTablesFromPbiReport(report.id!);
      for (const table of tables) {
        const key = `${table.schema}.${table.tableName}`.toLowerCase();
        if (!allTables.has(key)) {
          allTables.set(key, table);
        }
      }
    }

    // Generate column rows for unique tables
    csv += this.generateUniqueColumnRows(Array.from(allTables.values()));

    return csv;
  }

  /**
   * Generate CSV rows for unique tables (no report info)
   */
  private generateUniqueColumnRows(
    tables: Array<{ schema: string; tableName: string }>
  ): string {
    let rows = '';

    for (const table of tables) {
      // Get SQL2 columns for this table
      // IMPORTANT: First try with report's schema (e.g., "syspro") - this is preferred
      // If table exists in multiple schemas (e.g., both "stage" and "syspro"), we use the
      // schema that matches the report's reference. Only fall back to schema-less search
      // if the table is not found in the report's schema.
      let sql2Columns = this.repos.column.findSql2ColumnsByTable(table.tableName, table.schema);
      let sql2Schema = table.schema; // Default to report schema
      if (sql2Columns.length === 0) {
        // Fallback: search without schema restriction
        sql2Columns = this.repos.column.findSql2ColumnsByTable(table.tableName);
      }
      // Get the actual SQL2 schema from the first column (if found)
      if (sql2Columns.length > 0 && sql2Columns[0].schemaName) {
        sql2Schema = sql2Columns[0].schemaName;
      }

      // Get TRN1 columns - same logic: prefer report's schema first
      let trn1Columns = this.repos.column.findTrn1ColumnsByObject(table.tableName, table.schema);
      if (trn1Columns.length === 0) {
        trn1Columns = this.repos.column.findTrn1ColumnsByObject(table.tableName);
      }

      // Build a map of TRN1 columns by name for matching
      const trn1ByName = new Map(trn1Columns.map(c => [c.columnName.toLowerCase(), c]));

      // Track which TRN1 columns we've matched
      const matchedTrn1 = new Set<string>();

      // If we have SQL2 columns, output one row per column
      if (sql2Columns.length > 0) {
        for (const sql2Col of sql2Columns) {
          const trn1Col = trn1ByName.get(sql2Col.columnName.toLowerCase());
          if (trn1Col) {
            matchedTrn1.add(sql2Col.columnName.toLowerCase());
          }

          rows += [
            this.escapeCsv(table.schema),           // Schema_In_Report
            this.escapeCsv(table.tableName),        // TableName
            this.escapeCsv(sql2Col.columnName),     // ColumnName
            // NewSyspro columns first
            trn1Col ? 'Yes' : 'No',                 // InNewSyspro
            trn1Col ? this.escapeCsv(trn1Col.dataType) : '-',
            trn1Col ? (trn1Col.maxLength?.toString() || '') : '-',
            trn1Col ? (trn1Col.isNullable === true ? 'Yes' : trn1Col.isNullable === false ? 'No' : '-') : '-',
            // SQL2 columns
            'Yes',                                   // InSQL2
            this.escapeCsv(sql2Col.schemaName || sql2Schema), // SQL2_Schema (actual schema)
            this.escapeCsv(sql2Col.dataType),
            sql2Col.maxLength?.toString() || '',
            sql2Col.isNullable === true ? 'Yes' : sql2Col.isNullable === false ? 'No' : '-'
          ].join(',') + '\n';
        }

        // Output NewSyspro-only columns (exist in NewSyspro but not SQL2)
        for (const trn1Col of trn1Columns) {
          if (!matchedTrn1.has(trn1Col.columnName.toLowerCase())) {
            rows += [
              this.escapeCsv(table.schema),           // Schema_In_Report
              this.escapeCsv(table.tableName),        // TableName
              this.escapeCsv(trn1Col.columnName),     // ColumnName
              // NewSyspro columns
              'Yes',                                   // InNewSyspro
              this.escapeCsv(trn1Col.dataType),
              trn1Col.maxLength?.toString() || '',
              trn1Col.isNullable === true ? 'Yes' : trn1Col.isNullable === false ? 'No' : '-',
              // SQL2 columns (not present)
              'No',                                    // InSQL2
              '-',                                     // SQL2_Schema
              '-', '-', '-'
            ].join(',') + '\n';
          }
        }
      } else if (trn1Columns.length > 0) {
        // Only NewSyspro columns exist
        for (const trn1Col of trn1Columns) {
          rows += [
            this.escapeCsv(table.schema),           // Schema_In_Report
            this.escapeCsv(table.tableName),        // TableName
            this.escapeCsv(trn1Col.columnName),     // ColumnName
            // NewSyspro columns
            'Yes',                                   // InNewSyspro
            this.escapeCsv(trn1Col.dataType),
            trn1Col.maxLength?.toString() || '',
            trn1Col.isNullable === true ? 'Yes' : trn1Col.isNullable === false ? 'No' : '-',
            // SQL2 columns (not present)
            'No',                                    // InSQL2
            '-',                                     // SQL2_Schema
            '-', '-', '-'
          ].join(',') + '\n';
        }
      } else {
        // No columns found in either database - output a row indicating this
        rows += [
          this.escapeCsv(table.schema),             // Schema_In_Report
          this.escapeCsv(table.tableName),          // TableName
          '(no columns found)',                     // ColumnName
          // NewSyspro
          'No',                                     // InNewSyspro
          '-', '-', '-',
          // SQL2
          'No',                                     // InSQL2
          '-',                                      // SQL2_Schema
          '-', '-', '-'
        ].join(',') + '\n';
      }
    }

    return rows;
  }

  /**
   * Get unique tables from an SSRS report's lineage (public for use by other services)
   */
  getUniqueTablesFromReport(reportId: number): Array<{ schema: string; tableName: string }> {
    const edges = this.repos.lineage.findByReportId(reportId);
    const tables: Array<{ schema: string; tableName: string }> = [];
    const seen = new Set<string>();

    // Direct TABLE edges
    const tableEdges = edges.filter((e) => e.targetType === 'TABLE');
    for (const edge of tableEdges) {
      // First try lookup by ID
      let table = edge.targetId > 0 ? this.repos.table.findById(edge.targetId) : undefined;
      // If not found by ID (stale reference), try by name
      if (!table && edge.targetName) {
        table = this.repos.table.findByName(edge.targetName);
      }
      if (table) {
        const key = `${table.schemaName}.${table.tableName}`.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          tables.push({ schema: table.schemaName, tableName: table.tableName });
        }
      }
    }

    // Tables from VIEW edges (trace through views)
    const viewEdges = edges.filter((e) => e.targetType === 'VIEW');
    for (const viewEdge of viewEdges) {
      if (!viewEdge.targetName) continue;
      const baseTables = this.findAllBaseTables(viewEdge.targetName, [], [], new Set());
      for (const bt of baseTables) {
        if (!bt.isExternal) {
          const key = `${bt.schema || 'dbo'}.${bt.tableName}`.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            tables.push({ schema: bt.schema || 'dbo', tableName: bt.tableName });
          }
        }
      }
    }

    // Tables from PROC edges (trace through procs)
    const procEdges = edges.filter((e) => e.targetType === 'PROC');
    for (const procEdge of procEdges) {
      if (!procEdge.targetName) continue;
      const { tables: procTables } = this.findTablesFromProc(procEdge.targetName, new Set());
      for (const bt of procTables) {
        if (!bt.isExternal) {
          const key = `${bt.schema || 'dbo'}.${bt.tableName}`.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            tables.push({ schema: bt.schema || 'dbo', tableName: bt.tableName });
          }
        }
      }
    }

    return tables;
  }

  /**
   * Get unique tables from a Power BI report
   */
  private getUniqueTablesFromPbiReport(reportId: number): Array<{ schema: string; tableName: string }> {
    const pbiTables = this.repos.pbiTable.findByReportId(reportId);
    const tables: Array<{ schema: string; tableName: string }> = [];
    const seen = new Set<string>();

    for (const pbiTable of pbiTables) {
      const excelRef = pbiTable.sourceViewOrTable || '';
      if (!excelRef) continue;

      // Check if it's directly a table
      const directTable = this.repos.table.findByName(excelRef);
      if (directTable) {
        const key = `${directTable.schemaName}.${directTable.tableName}`.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          tables.push({ schema: directTable.schemaName, tableName: directTable.tableName });
        }
        continue;
      }

      // Check if it's a view - trace to base tables
      const view = this.repos.view.findByName(excelRef);
      if (view) {
        const baseTables = this.findAllBaseTables(excelRef, [], [], new Set());
        for (const bt of baseTables) {
          if (!bt.isExternal) {
            const key = `${bt.schema || 'dbo'}.${bt.tableName}`.toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              tables.push({ schema: bt.schema || 'dbo', tableName: bt.tableName });
            }
          }
        }
      }
    }

    return tables;
  }

}
