import { Repositories } from "../repositories/index.js";
import { extractColumns, ColumnReference } from "../parsers/sql.analyzer.js";

/**
 * Custom Field Finder (CFF) - identifies columns from custom tables (tables ending with +)
 * used in views and stored procedures across all reports.
 *
 * SIMPLIFIED APPROACH:
 * 1. Use lineage edges to find all VIEW → TABLE+ connections
 * 2. Trace back through lineage to find which PROCs call those views
 * 3. Extract columns from the view SQL
 */

export interface CustomFieldUsage {
  reportId: number;
  reportName: string;
  reportPath: string;
  reportType: "SSRS" | "PowerBI";
  entityType: "VIEW" | "PROC" | "DATASET";
  entityName: string;
  customTableSchema: string;
  customTableName: string; // Table ending with +
  columnName: string; // Or '[DYNAMIC_SQL]', '[PARSE_ERROR]' if extraction failed
  usageType: string; // SELECT, WHERE, JOIN, etc.
  extractionStatus:
    | "OK"
    | "DYNAMIC_SQL"
    | "PARSE_ERROR"
    | "UNKNOWN"
    | "SELECT_STAR";
  inSQL2: string; // "Yes (schema.table)" or "No (checked: schema.table)"
  sql2DataType: string | null;
  inNewSyspro: string; // "Yes (schema.table)" or "No (checked: schema.table)"
  trn1DataType: string | null;
}

export class CffService {
  // Cache for extracted columns to avoid re-parsing the same SQL
  private columnCache = new Map<
    string,
    Array<{
      columnName: string;
      usageType: string;
      status: "OK" | "DYNAMIC_SQL" | "PARSE_ERROR" | "UNKNOWN" | "SELECT_STAR";
    }>
  >();

  constructor(private repos: Repositories) {}

  /**
   * Clear the column extraction cache (call before a new full export)
   */
  private clearCache(): void {
    this.columnCache.clear();
  }

  /**
   * Find custom fields for a single SSRS report
   */
  findCustomFieldsForReport(reportId: number): CustomFieldUsage[] {
    const report = this.repos.report.findById(reportId);
    if (!report || report.status !== "COMPLETED") {
      return [];
    }

    return this.findCustomFieldsForSsrsReport(
      reportId,
      report.reportName || report.fileName,
      report.filePath || "",
    );
  }

  /**
   * Find custom fields for all starred reports (SSRS + Power BI)
   */
  findCustomFieldsForAllReports(): CustomFieldUsage[] {
    // Clear cache for fresh export
    this.clearCache();

    const results: CustomFieldUsage[] = [];

    // Process starred SSRS template reports
    const ssrsReports = this.repos.report.findStarred();
    const completedSsrs = ssrsReports.filter((r) => r.status === "COMPLETED");

    for (const report of completedSsrs) {
      const fields = this.findCustomFieldsForSsrsReport(
        report.id!,
        report.reportName || report.fileName,
        report.filePath || "",
      );
      results.push(...fields);
    }

    // Process starred linked reports (they use their template's lineage)
    const linkedReports = this.repos.linkedReport.findStarred();
    for (const linkedReport of linkedReports) {
      const templateReport = this.repos.report.findByFilePath(
        linkedReport.templatePath,
      );
      if (templateReport && templateReport.status === "COMPLETED") {
        const fields = this.findCustomFieldsForSsrsReport(
          templateReport.id!,
          linkedReport.linkedReportName,
          linkedReport.linkedReportPath,
        );
        results.push(...fields);
      }
    }

    // Process starred Power BI reports
    const pbiReports = this.repos.pbiReport
      .findAll()
      .filter((r) => r.starred === true);
    for (const report of pbiReports) {
      const fields = this.findCustomFieldsForPbiReport(
        report.id!,
        report.reportName,
      );
      results.push(...fields);
    }

    return results;
  }

  /**
   * Export all custom fields to CSV with summary statistics
   */
  exportCffToCsv(): string {
    const header =
      [
        "ReportType",
        "ReportName",
        "ReportPath",
        "EntityType",
        "EntityName",
        "CustomTableSchema",
        "CustomTableName",
        "ColumnName",
        "UsageType",
        "ExtractionStatus",
        "InSQL2",
        "SQL2_DataType",
        "InNewSyspro",
        "TRN1_DataType",
      ].join(",") + "\n";

    let csv = header;

    const customFields = this.findCustomFieldsForAllReports();

    // Count statistics
    const stats = {
      total: customFields.length,
      ok: 0,
      selectStar: 0,
      dynamicSql: 0,
      parseError: 0,
      unknown: 0,
      inSQL2: 0,
      inNewSyspro: 0,
    };

    const uniqueReports = new Set<string>();
    const uniqueTables = new Set<string>();
    const uniqueColumns = new Set<string>();

    for (const field of customFields) {
      // Count by extraction status
      switch (field.extractionStatus) {
        case "OK":
          stats.ok++;
          break;
        case "SELECT_STAR":
          stats.selectStar++;
          break;
        case "DYNAMIC_SQL":
          stats.dynamicSql++;
          break;
        case "PARSE_ERROR":
          stats.parseError++;
          break;
        case "UNKNOWN":
          stats.unknown++;
          break;
      }

      // Count metadata availability
      if (field.inSQL2.startsWith("Yes")) stats.inSQL2++;
      if (field.inNewSyspro.startsWith("Yes")) stats.inNewSyspro++;

      // Track unique items
      uniqueReports.add(field.reportName);
      uniqueTables.add(
        `${field.customTableSchema}.${field.customTableName}`.toLowerCase(),
      );
      if (!field.columnName.startsWith("[")) {
        uniqueColumns.add(
          `${field.customTableName}.${field.columnName}`.toLowerCase(),
        );
      }

      // Output data row
      csv +=
        [
          field.reportType,
          this.escapeCsv(field.reportName),
          this.escapeCsv(field.reportPath),
          field.entityType,
          this.escapeCsv(field.entityName),
          this.escapeCsv(field.customTableSchema),
          this.escapeCsv(field.customTableName),
          this.escapeCsv(field.columnName),
          this.escapeCsv(field.usageType),
          field.extractionStatus,
          field.inSQL2,
          this.escapeCsv(field.sql2DataType || "-"),
          field.inNewSyspro,
          this.escapeCsv(field.trn1DataType || "-"),
        ].join(",") + "\n";
    }

    // Add summary section
    csv += "\n";
    csv += "--- SUMMARY ---,,,,,,,,,,,,,\n";
    csv += `Total Custom Field Usages,${stats.total},,,,,,,,,,,,\n`;
    csv += `Unique Reports Using Custom Fields,${uniqueReports.size},,,,,,,,,,,,\n`;
    csv += `Unique Custom Tables,${uniqueTables.size},,,,,,,,,,,,\n`;
    csv += `Unique Custom Columns,${uniqueColumns.size},,,,,,,,,,,,\n`;
    csv += "\n";
    csv += "--- BY EXTRACTION STATUS ---,,,,,,,,,,,,,\n";
    csv += `OK (Successfully Extracted),${stats.ok},${this.pct(stats.ok, stats.total)},,,,,,,,,,,\n`;
    csv += `SELECT_STAR (All Columns via SELECT *),${stats.selectStar},${this.pct(stats.selectStar, stats.total)},,,,,,,,,,,\n`;
    csv += `DYNAMIC_SQL (Could Not Extract - Dynamic SQL),${stats.dynamicSql},${this.pct(stats.dynamicSql, stats.total)},,,,,,,,,,,\n`;
    csv += `PARSE_ERROR (Could Not Extract - Parse Failed),${stats.parseError},${this.pct(stats.parseError, stats.total)},,,,,,,,,,,\n`;
    csv += `UNKNOWN (Could Not Resolve Table),${stats.unknown},${this.pct(stats.unknown, stats.total)},,,,,,,,,,,\n`;
    csv += "\n";
    csv += "--- METADATA AVAILABILITY ---,,,,,,,,,,,,,\n";
    csv += `Columns Found in SQL2,${stats.inSQL2},${this.pct(stats.inSQL2, stats.total)},,,,,,,,,,,\n`;
    csv += `Columns Found in New Syspro (TRN1),${stats.inNewSyspro},${this.pct(stats.inNewSyspro, stats.total)},,,,,,,,,,,\n`;

    return csv;
  }

  /**
   * Calculate percentage string
   */
  private pct(count: number, total: number): string {
    if (total === 0) return "0%";
    return `${((count / total) * 100).toFixed(1)}%`;
  }

  /**
   * SIMPLIFIED: Find custom fields using lineage edges directly
   *
   * Algorithm:
   * 1. Get all lineage edges for the report
   * 2. Find edges where target is a custom table (ends with +)
   * 3. The source of that edge is the VIEW that uses the custom table
   * 4. Trace back through lineage to find PROCs that call that view
   * 5. Extract columns from the view's SQL
   */
  private findCustomFieldsForSsrsReport(
    reportId: number,
    reportName: string,
    reportPath: string,
  ): CustomFieldUsage[] {
    const results: CustomFieldUsage[] = [];
    const edges = this.repos.lineage.findByReportId(reportId);

    // Step 1: Find all custom table edges (VIEW/PROC → TABLE+ or TABLE_NOT_FOUND with +)
    const customTableEdges = edges.filter(
      (e) =>
        (e.targetType === "TABLE" || e.targetType === "TABLE_NOT_FOUND") &&
        e.targetName &&
        e.targetName.endsWith("+"),
    );

    // Step 2: Build a map of what calls what (for tracing PROCs)
    const callsMap = new Map<string, Set<string>>(); // entity -> set of entities that call it
    for (const edge of edges) {
      if (edge.targetName && edge.sourceName) {
        const key = edge.targetName.toLowerCase();
        if (!callsMap.has(key)) {
          callsMap.set(key, new Set());
        }
        callsMap.get(key)!.add(`${edge.sourceType}|${edge.sourceName}`);
      }
    }

    // Step 3: For each custom table edge, process the source entity
    for (const edge of customTableEdges) {
      if (!edge.sourceName || !edge.targetName) continue;

      let customTableName = edge.targetName;
      const sourceEntityName = edge.sourceName;
      const sourceEntityType = edge.sourceType as "VIEW" | "PROC" | "DATASET";

      // Handle @DYNAMIC. prefix from dynamic SQL tables (e.g., "@DYNAMIC.dbo.ApSupplier+")
      if (customTableName.startsWith("@DYNAMIC.")) {
        customTableName = customTableName.substring(9); // Remove "@DYNAMIC."
      }

      // Extract schema from table name if present (e.g., "dbo.ApSupplier+" or "syspro.InvMaster+")
      let tableSchema = "";
      let tableName = customTableName;
      if (customTableName.includes(".")) {
        const parts = customTableName.split(".");
        tableSchema = parts[0];
        tableName = parts.slice(1).join(".");
      }

      // Get the source entity definition to extract columns
      // For views, try ALL matching views since there may be duplicates in different schemas
      let definition: string | null = null;
      if (sourceEntityType === "VIEW") {
        definition = this.findViewDefinitionWithCustomTable(
          sourceEntityName,
          tableName,
        );
      } else if (sourceEntityType === "PROC") {
        const proc = this.repos.storedProc.findByName(sourceEntityName);
        definition = proc?.definition || null;
      } else if (sourceEntityType === "DATASET") {
        // Direct SQL from dataset - get commandText from datasets table
        const datasets = this.repos.dataset.findByReportId(reportId);
        const dataset = datasets.find(
          (d) => d.datasetName === sourceEntityName,
        );
        definition = dataset?.commandText || null;
      }

      // Extract columns from the definition
      const columnResults = this.extractColumnsForCustomTable(
        definition,
        tableName,
        tableSchema,
      );

      // Add results for the SOURCE entity (VIEW or PROC)
      for (const col of columnResults) {
        results.push({
          reportId,
          reportName,
          reportPath,
          reportType: "SSRS",
          entityType: sourceEntityType,
          entityName: sourceEntityName,
          customTableSchema: tableSchema,
          customTableName: tableName,
          columnName: col.columnName,
          usageType: col.usageType,
          extractionStatus: col.status,
          ...this.getColumnMetadata(tableName, tableSchema, col.columnName),
        });
      }

      // Step 4: Trace back to find ALL entities (VIEWs, PROCs) that call this entity
      // This captures the full cascade: PROC → VIEW1 → VIEW2 → TABLE+
      const callingEntities = this.findAllCallingEntities(
        sourceEntityName,
        callsMap,
        new Set(),
      );
      for (const caller of callingEntities) {
        // Map entity types to valid CFF types
        const entityType: "VIEW" | "PROC" | "DATASET" =
          caller.type === "PROC"
            ? "PROC"
            : caller.type === "DATASET"
              ? "DATASET"
              : caller.type === "SHARED_DATASET"
                ? "DATASET"
                : "VIEW";

        for (const col of columnResults) {
          results.push({
            reportId,
            reportName,
            reportPath,
            reportType: "SSRS",
            entityType,
            entityName: caller.name,
            customTableSchema: tableSchema,
            customTableName: tableName,
            columnName: col.columnName,
            usageType: col.usageType,
            extractionStatus: col.status,
            ...this.getColumnMetadata(tableName, tableSchema, col.columnName),
          });
        }
      }
    }

    return this.deduplicateResults(results);
  }

  /**
   * Find ALL entities (VIEWs, PROCs, DATASETs, PBI_TABLEs) that call a given entity
   * Returns the full chain, not just the end PROCs
   */
  private findAllCallingEntities(
    entityName: string,
    callsMap: Map<string, Set<string>>,
    visited: Set<string>,
  ): Array<{ type: string; name: string }> {
    const entities: Array<{ type: string; name: string }> = [];
    const key = entityName.toLowerCase();

    if (visited.has(key) || visited.size > 50) return entities;
    visited.add(key);

    const callers = callsMap.get(key);
    if (!callers) return entities;

    for (const caller of callers) {
      const [type, name] = caller.split("|");
      // Include all entity types: PROC, VIEW, DATASET, PBI_TABLE, SHARED_DATASET
      if (
        type === "PROC" ||
        type === "VIEW" ||
        type === "DATASET" ||
        type === "PBI_TABLE" ||
        type === "SHARED_DATASET"
      ) {
        // Add this entity
        entities.push({ type, name });
        // Recursively find entities that call this one
        const parentEntities = this.findAllCallingEntities(
          name,
          callsMap,
          visited,
        );
        entities.push(...parentEntities);
      }
    }

    return entities;
  }

  /**
   * Extract columns for a specific custom table from SQL
   */
  private extractColumnsForCustomTable(
    sql: string | null,
    tableName: string,
    tableSchema: string,
  ): Array<{
    columnName: string;
    usageType: string;
    status: "OK" | "DYNAMIC_SQL" | "PARSE_ERROR" | "UNKNOWN" | "SELECT_STAR";
  }> {
    // Check cache first - key is sql hash + tableName
    const cacheKey = `${tableName.toLowerCase()}:${sql?.substring(0, 100) || "null"}`;
    const cached = this.columnCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const results: Array<{
      columnName: string;
      usageType: string;
      status: "OK" | "DYNAMIC_SQL" | "PARSE_ERROR" | "UNKNOWN" | "SELECT_STAR";
    }> = [];

    if (!sql) {
      results.push({
        columnName: "[NO_DEFINITION]",
        usageType: "UNKNOWN",
        status: "PARSE_ERROR",
      });
      return results;
    }

    // Check for dynamic SQL
    const hasDynamicSql = this.containsDynamicSql(sql);

    // Try to extract columns
    let columns: ColumnReference[];
    try {
      columns = extractColumns(sql);
    } catch {
      columns = [];
    }

    // Build alias map for the custom table
    const aliasMap = this.buildAliasMapForTable(sql, tableName);

    // Check for SELECT *
    const hasSelectStar = /SELECT\s+(\*|[a-z_]+\.\*)/i.test(sql);

    // Find columns that reference this custom table
    for (const col of columns) {
      if (col.table) {
        const resolvedTable = aliasMap.get(col.table.toLowerCase());
        if (
          resolvedTable &&
          resolvedTable.toLowerCase() === tableName.toLowerCase()
        ) {
          results.push({
            columnName: col.column,
            usageType: col.operation.toUpperCase(),
            status: "OK",
          });
        }
      }
    }

    // If no columns found but SELECT * is used
    if (results.length === 0 && hasSelectStar) {
      const tableColumns = this.repos.column.findSql2ColumnsByTable(
        tableName,
        tableSchema,
      );
      if (tableColumns.length > 0) {
        for (const col of tableColumns) {
          results.push({
            columnName: col.columnName,
            usageType: "SELECT",
            status: "SELECT_STAR",
          });
        }
      } else {
        results.push({
          columnName: "[SELECT_STAR]",
          usageType: "SELECT",
          status: "SELECT_STAR",
        });
      }
    }

    // If still no columns, add placeholder
    if (results.length === 0) {
      if (hasDynamicSql) {
        results.push({
          columnName: "[DYNAMIC_SQL]",
          usageType: "UNKNOWN",
          status: "DYNAMIC_SQL",
        });
      } else {
        results.push({
          columnName: "[PARSE_ERROR]",
          usageType: "UNKNOWN",
          status: "PARSE_ERROR",
        });
      }
    }

    // Cache results for reuse
    this.columnCache.set(cacheKey, results);
    return results;
  }

  /**
   * Build alias map for a specific table in SQL
   */
  private buildAliasMapForTable(
    sql: string,
    tableName: string,
  ): Map<string, string> {
    const aliasMap = new Map<string, string>();
    const tableNameLower = tableName.toLowerCase();

    // Pattern to match table aliases - order matters, more specific patterns first
    const patterns = [
      // [schema].[table] AS alias or [schema].[table] alias (both bracketed)
      /(?:FROM|JOIN)\s+(?:\[([^\]]+)\]\.)?\[([^\]]+)\]\s+(?:AS\s+)?(\w+)/gi,
      // schema.[table] AS alias (schema unbracketed, table bracketed - common in T-SQL)
      /(?:FROM|JOIN)\s+(?:(\w+)\.)?\[([^\]]+)\]\s+(?:AS\s+)?(\w+)/gi,
      // schema.table AS alias or schema.table alias (neither bracketed)
      /(?:FROM|JOIN)\s+(?:(\w+)\.)?(\w+)\s+(?:AS\s+)?(\w+)(?!\s*\.)/gi,
    ];

    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, "gi");
      let match: RegExpExecArray | null;

      while ((match = regex.exec(sql)) !== null) {
        const matchedTable = match[2];
        const alias = match[3];

        if (
          matchedTable &&
          alias &&
          matchedTable.toLowerCase() === tableNameLower
        ) {
          aliasMap.set(alias.toLowerCase(), tableName);
        }
      }
    }

    // Also map table name to itself
    aliasMap.set(tableNameLower, tableName);

    return aliasMap;
  }

  /**
   * Check if SQL contains dynamic SQL patterns
   */
  private containsDynamicSql(sql: string): boolean {
    const upperSql = sql.toUpperCase();
    return (
      upperSql.includes("SP_EXECUTESQL") ||
      /EXEC(UTE)?\s*\(\s*@\w+/i.test(sql) ||
      /@\w+\s*\+\s*'\.'\s*\+\s*@\w+/i.test(sql)
    );
  }

  /**
   * Find view definition that contains the custom table reference.
   * When multiple views have the same name (e.g., bi.vSorDetailRep and syspro.vSorDetailRep),
   * this method tries each one and returns the definition that actually references the custom table.
   */
  private findViewDefinitionWithCustomTable(
    viewName: string,
    customTableName: string,
  ): string | null {
    const views = this.repos.view.findAllByName(viewName);
    if (views.length === 0) return null;

    // If only one view, return it
    if (views.length === 1) {
      return views[0].definition || null;
    }

    // Multiple views with same name - find the one that references the custom table
    const customTablePattern = new RegExp(
      customTableName.replace(/[+]/g, "\\+"),
      "i",
    );
    for (const view of views) {
      if (view.definition && customTablePattern.test(view.definition)) {
        return view.definition;
      }
    }

    // Fallback to first view (syspro preferred due to ORDER BY in findAllByName)
    return views[0].definition || null;
  }

  /**
   * Find custom fields for a Power BI report
   */
  private findCustomFieldsForPbiReport(
    reportId: number,
    reportName: string,
  ): CustomFieldUsage[] {
    const results: CustomFieldUsage[] = [];
    const pbiLineage = this.repos.pbiLineage.findByReportId(reportId);

    // Find edges where target is a custom table (including TABLE_NOT_FOUND)
    const customTableEdges = pbiLineage.filter(
      (e) =>
        (e.targetType === "TABLE" || e.targetType === "TABLE_NOT_FOUND") &&
        e.targetName &&
        e.targetName.endsWith("+"),
    );

    // Build calls map for tracing
    const callsMap = new Map<string, Set<string>>();
    for (const edge of pbiLineage) {
      if (edge.targetName && edge.sourceName) {
        const key = edge.targetName.toLowerCase();
        if (!callsMap.has(key)) {
          callsMap.set(key, new Set());
        }
        callsMap.get(key)!.add(`${edge.sourceType}|${edge.sourceName}`);
      }
    }

    for (const edge of customTableEdges) {
      if (!edge.sourceName || !edge.targetName) continue;

      let customTableName = edge.targetName;
      const sourceEntityName = edge.sourceName;
      const sourceEntityType = edge.sourceType as "VIEW" | "PROC" | "PBI_TABLE";

      // Handle @DYNAMIC. prefix from dynamic SQL tables
      if (customTableName.startsWith("@DYNAMIC.")) {
        customTableName = customTableName.substring(9);
      }

      // Extract schema
      let tableSchema = "";
      let tableName = customTableName;
      if (customTableName.includes(".")) {
        const parts = customTableName.split(".");
        tableSchema = parts[0];
        tableName = parts.slice(1).join(".");
      }

      // Get the source entity definition to extract columns (same logic as SSRS)
      // For views, try ALL matching views since there may be duplicates in different schemas
      let definition: string | null = null;
      if (sourceEntityType === "VIEW") {
        definition = this.findViewDefinitionWithCustomTable(
          sourceEntityName,
          tableName,
        );
      } else if (sourceEntityType === "PROC") {
        const proc = this.repos.storedProc.findByName(sourceEntityName);
        definition = proc?.definition || null;
      } else if (sourceEntityType === "PBI_TABLE") {
        // Power BI tables may reference a view/table - check pbi_tables
        const pbiTables = this.repos.pbiTable.findByReportId(reportId);
        const pbiTable = pbiTables.find(
          (t) => t.tableName === sourceEntityName,
        );
        // PBI tables reference underlying view/table via sourceViewOrTable field
        if (pbiTable?.sourceViewOrTable) {
          definition = this.findViewDefinitionWithCustomTable(
            pbiTable.sourceViewOrTable,
            tableName,
          );
        }
      }

      // Extract columns
      const columnResults = this.extractColumnsForCustomTable(
        definition,
        tableName,
        tableSchema,
      );

      // Add results for the SOURCE entity (VIEW, PROC, or PBI_TABLE mapped to VIEW)
      const mappedEntityType: "VIEW" | "PROC" | "DATASET" =
        sourceEntityType === "PROC" ? "PROC" : "VIEW";
      for (const col of columnResults) {
        results.push({
          reportId,
          reportName,
          reportPath: "",
          reportType: "PowerBI",
          entityType: mappedEntityType,
          entityName: sourceEntityName,
          customTableSchema: tableSchema,
          customTableName: tableName,
          columnName: col.columnName,
          usageType: col.usageType,
          extractionStatus: col.status,
          ...this.getColumnMetadata(tableName, tableSchema, col.columnName),
        });
      }

      // Trace back to find ALL calling entities (PBI_TABLE, intermediate VIEWs)
      const callingEntities = this.findAllCallingEntities(
        sourceEntityName,
        callsMap,
        new Set(),
      );
      for (const caller of callingEntities) {
        // Map entity types to valid CFF types
        const entityType: "VIEW" | "PROC" | "DATASET" =
          caller.type === "PROC"
            ? "PROC"
            : caller.type === "DATASET"
              ? "DATASET"
              : caller.type === "SHARED_DATASET"
                ? "DATASET"
                : "VIEW"; // PBI_TABLE, VIEW → VIEW

        for (const col of columnResults) {
          results.push({
            reportId,
            reportName,
            reportPath: "",
            reportType: "PowerBI",
            entityType,
            entityName: caller.name,
            customTableSchema: tableSchema,
            customTableName: tableName,
            columnName: col.columnName,
            usageType: col.usageType,
            extractionStatus: col.status,
            ...this.getColumnMetadata(tableName, tableSchema, col.columnName),
          });
        }
      }
    }

    return this.deduplicateResults(results);
  }

  /**
   * Get column metadata from SQL2 and TRN1 databases
   * Returns descriptive status showing which schema.table was checked
   */
  private getColumnMetadata(
    tableName: string,
    schema: string,
    columnName: string,
  ): {
    inSQL2: string;
    sql2DataType: string | null;
    inNewSyspro: string;
    trn1DataType: string | null;
  } {
    const checkedLocation = schema ? `${schema}.${tableName}` : tableName;

    // Skip metadata lookup for placeholder columns
    if (columnName.startsWith("[")) {
      return {
        inSQL2: `No (checked: ${checkedLocation})`,
        sql2DataType: null,
        inNewSyspro: `No (checked: ${checkedLocation})`,
        trn1DataType: null,
      };
    }

    // Look up SQL2 column - try with schema first, then without
    let sql2Columns = this.repos.column.findSql2ColumnsByTable(tableName, schema);
    let foundSql2Schema = schema;

    // If not found with given schema, try searching by table name only
    if (sql2Columns.length === 0 && schema) {
      sql2Columns = this.repos.column.findSql2ColumnsByTable(tableName, "");
      if (sql2Columns.length > 0) {
        foundSql2Schema = sql2Columns[0]?.schemaName || "";
      }
    }

    const sql2Col = sql2Columns.find(
      (c) => c.columnName.toLowerCase() === columnName.toLowerCase(),
    );

    // Look up TRN1 column
    let trn1Columns = this.repos.column.findTrn1ColumnsByObject(tableName, schema);
    let foundTrn1Schema = schema;

    if (trn1Columns.length === 0 && schema) {
      trn1Columns = this.repos.column.findTrn1ColumnsByObject(tableName, "");
      if (trn1Columns.length > 0) {
        foundTrn1Schema = trn1Columns[0]?.schemaName || "";
      }
    }

    const trn1Col = trn1Columns.find(
      (c) => c.columnName.toLowerCase() === columnName.toLowerCase(),
    );

    // Build descriptive status with schema info
    const sql2Status = sql2Col
      ? `Yes (${foundSql2Schema || "dbo"}.${tableName})`
      : `No (checked: ${checkedLocation})`;

    const trn1Status = trn1Col
      ? `Yes (${foundTrn1Schema || "dbo"}.${tableName})`
      : `No (checked: ${checkedLocation})`;

    return {
      inSQL2: sql2Status,
      sql2DataType: sql2Col?.dataType || null,
      inNewSyspro: trn1Status,
      trn1DataType: trn1Col?.dataType || null,
    };
  }

  /**
   * Deduplicate results - same report/entity/table/column should only appear once
   */
  private deduplicateResults(results: CustomFieldUsage[]): CustomFieldUsage[] {
    const seen = new Set<string>();
    const deduped: CustomFieldUsage[] = [];

    for (const result of results) {
      const key = [
        result.reportId,
        result.entityType,
        result.entityName.toLowerCase(),
        result.customTableName.toLowerCase(),
        result.columnName.toLowerCase(),
      ].join("|");

      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(result);
      }
    }

    return deduped;
  }

  /**
   * Escape CSV value
   */
  private escapeCsv(value: string | null): string {
    if (!value) return "";
    let sanitized = value
      .replace(/→/g, "->")
      .replace(/←/g, "<-")
      .replace(/↔/g, "<->")
      .replace(/–/g, "-")
      .replace(/—/g, "--");

    if (
      sanitized.includes(",") ||
      sanitized.includes('"') ||
      sanitized.includes("\n")
    ) {
      return `"${sanitized.replace(/"/g, '""')}"`;
    }
    return sanitized;
  }
}
