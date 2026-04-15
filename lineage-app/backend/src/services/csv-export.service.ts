import { Repositories } from '../repositories/index.js';
import { extractTables } from '../parsers/sql.analyzer.js';

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
}

export class CsvExportService {
  constructor(private repos: Repositories) {}

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
      'SQL2(D300SQLDW01) Has PK'
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

    for (const report of reports) {
      const edges = this.repos.lineage.findByReportId(report.id!);
      const datasets = this.repos.dataset.findByReportId(report.id!);
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
          const table = this.repos.table.findById(edge.targetId);
          if (table) {
            foundTable = table.tableName;
            // Don't fill in schema - leave blank, comment will show available schemas
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
          reportName: report.reportName || report.fileName,
          reportPath: report.filePath || '',
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
          const allViews = [viewEdge.targetName, ...bt.viewPath];

          const { procs, views, comment } = this.splitPathsWithOverflow(allProcs, allViews);
          // Add comment for external tables not found in metadata
          let finalComment = bt.isExternal
            ? (comment ? `${comment}; Base table not in SQL2(D300SQLDW01) metadata` : 'Base table not in SQL2(D300SQLDW01) metadata')
            : comment;
          // Add schemas comment if schema not specified
          const schemasComment = this.getSchemasComment(bt.tableName);
          if (schemasComment) {
            finalComment = finalComment ? `${finalComment}; ${schemasComment}` : schemasComment;
          }

          rows += this.formatRow({
            reportType: 'SSRS',
            reportName: report.reportName || report.fileName,
            reportPath: report.filePath || '',
            datasetName: chain.datasetName,
            datasetType: chain.datasetType,
            procs,
            views,
            comment: finalComment,
            metadataTable: bt.tableName,
            metadataSchema: bt.schema,
            linkedServer: '',
            linkedServerDatabase: bt.isExternal ? bt.database : '',
            status: bt.isExternal ? 'No' : 'Yes',
            hasPk: bt.hasPk,
          });
        }
      }

      // Trace through PROCs to find base tables
      for (const procEdge of procEdges) {
        if (!procEdge.targetName) continue;

        const { tables, procPath } = this.findTablesFromProc(procEdge.targetName, new Set());

        for (const bt of tables) {
          hasAnyTables = true;

          // Build the full path from dataset to this proc
          const chain = this.buildEntityChain(edges, datasetMap, procEdge);

          // Combine all procs: from dataset chain + procPath from tracing
          const allProcs = [...chain.procs, procEdge.targetName, ...bt.procPath.filter(p => p !== procEdge.targetName)];
          // Add any views from the table tracing
          const allViews = [...chain.views, ...bt.viewPath];

          const { procs, views, comment } = this.splitPathsWithOverflow(allProcs, allViews);
          // Add comment for external tables not found in metadata
          let finalComment = bt.isExternal
            ? (comment ? `${comment}; Base table not in SQL2(D300SQLDW01) metadata` : 'Base table not in SQL2(D300SQLDW01) metadata')
            : comment;
          // Add schemas comment if schema not specified
          const schemasComment = this.getSchemasComment(bt.tableName);
          if (schemasComment) {
            finalComment = finalComment ? `${finalComment}; ${schemasComment}` : schemasComment;
          }

          rows += this.formatRow({
            reportType: 'SSRS',
            reportName: report.reportName || report.fileName,
            reportPath: report.filePath || '',
            datasetName: chain.datasetName,
            datasetType: chain.datasetType,
            procs,
            views,
            comment: finalComment,
            metadataTable: bt.tableName,
            metadataSchema: bt.schema,
            linkedServer: '',
            linkedServerDatabase: bt.isExternal ? bt.database : '',
            status: bt.isExternal ? 'No' : 'Yes',
            hasPk: bt.hasPk,
          });
        }
      }

      // If no tables found at all, output a single row indicating this
      if (!hasAnyTables) {
        for (const ds of datasets) {
          rows += this.formatRow({
            reportType: 'SSRS',
            reportName: report.reportName || report.fileName,
            reportPath: report.filePath || '',
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
          });
        }
        if (datasets.length === 0) {
          rows += this.formatRow({
            reportType: 'SSRS',
            reportName: report.reportName || report.fileName,
            reportPath: report.filePath || '',
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
          });
        }
      }
    }

    return rows;
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
              views: [excelRef],
              comment: '',
              metadataTable: 'No base tables found in view',
              metadataSchema: view.schemaName || '',
              linkedServer: '',
              linkedServerDatabase: '',
              status: 'VIEW_NO_TABLES',
              hasPk: '-',
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
              metadataSchema: bt.schema,
              linkedServer: '',
              linkedServerDatabase: bt.isExternal ? bt.database : '',
              status: bt.isExternal ? 'No' : 'Yes',
              hasPk: bt.hasPk,
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
        viewList.unshift(currentName);
      } else if (currentType === 'PROC') {
        procList.unshift(currentName);
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
}
