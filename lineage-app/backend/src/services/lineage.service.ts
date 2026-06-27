import { Repositories } from "../repositories/index.js";
import {
  LineageGraphDto,
  LineageNodeDto,
  LineageEdgeDto,
  ParsingWarningDto,
  SourceTableDto,
  LineageEdge,
  Dataset,
  NodeType,
  Relationship,
  DiscoveryMethod,
} from "../types/index.js";
import {
  extractTables,
  extractStoredProcName,
  detectDynamicSqlWarnings,
  extractProcedureCalls,
  TableReference,
} from "../parsers/sql.analyzer.js";
import dayjs from "dayjs";

const FALSE_POSITIVES = new Set([
  "SYSPR",
  "SYSPRO",
  "DB",
  "DBO",
  "SYSP",
  "SYS",
  "MASTER",
  "TEMPDB",
  "MSDB",
  "MODEL",
  "INFORMATION_SCHEMA",
  "SYSCUSTOMIZATIONS",
  "SUN300",
  "SUN300D",
  "SUN300DSYSSQL01",
  "SYSPROCOMPANYC",
  "SYSPROCOMPANYS",
  "SYSPROREPORTING",
  "SYSPROEPASAGE",
  "REPORTSERVER",
  "REPORTSERVERTEMPDB",
  "STRING_SPLIT",
  "OPENJSON",
  "OPENXML",
  "INSERTED",
  "DELETED",
]);

export class LineageService {
  private linkedServerMap: Map<string, string> = new Map();

  constructor(private repos: Repositories) {
    this.loadLinkedServers();
  }

  // Load linked servers into a map: alias -> actualServer
  private loadLinkedServers(): void {
    const linkedServers = this.repos.linkedServer.findAll();
    this.linkedServerMap.clear();
    for (const ls of linkedServers) {
      if (ls.alias) {
        this.linkedServerMap.set(
          ls.alias.toUpperCase(),
          ls.actualServer || "UNKNOWN",
        );
      }
    }
    console.log(`Loaded ${this.linkedServerMap.size} linked server aliases`);
  }

  // Check if a server name is a known linked server alias
  private resolveLinkedServer(serverAlias: string): {
    isKnown: boolean;
    actualServer: string;
  } {
    const upper = serverAlias.toUpperCase();
    if (this.linkedServerMap.has(upper)) {
      return { isKnown: true, actualServer: this.linkedServerMap.get(upper)! };
    }
    return { isKnown: false, actualServer: "UNKNOWN" };
  }

  // Format entity name with schema prefix when available
  private formatNameWithSchema(name: string, schema: string | null): string {
    if (schema && schema.trim() !== "") {
      return `${schema}.${name}`;
    }
    return name; // Return as-is when no schema
  }

  // Look up an object in TRN1 schema
  private findInTrn1(objectName: string): {
    found: boolean;
    schema: string | null;
  } {
    const match = this.repos.trn1Schema.findByObjectName(objectName);
    if (match) {
      return { found: true, schema: match.schemaName };
    }
    return { found: false, schema: null };
  }

  buildLineage(reportId: number): void {
    // Refresh linked server map in case metadata was reloaded
    this.loadLinkedServers();
    console.log(`Building lineage for report ID: ${reportId}`);

    const report = this.repos.report.findById(reportId);
    if (!report) throw new Error(`Report not found: ${reportId}`);

    const datasets = this.repos.dataset.findByReportId(reportId);
    console.log(`Processing ${datasets.length} datasets`);

    for (const dataset of datasets) {
      this.saveEdge(
        reportId,
        "REPORT",
        reportId,
        report.reportName || "",
        "DATASET",
        dataset.id!,
        dataset.datasetName,
        "CONTAINS",
      );
      this.processDataset(reportId, dataset);
    }

    console.log(`Lineage building complete for report: ${report.fileName}`);
  }

  private processDataset(reportId: number, dataset: Dataset): void {
    const commandType = dataset.commandType;
    const commandText = dataset.commandText;

    if (commandType === "StoredProcedure") {
      this.processStoredProcedure(reportId, dataset, commandText);
    } else if (commandType === "Text") {
      this.processDirectSql(reportId, dataset, commandText);
    } else if (commandType === "SharedDataSet") {
      this.processSharedDataSet(reportId, dataset);
    }
  }

  private processStoredProcedure(
    reportId: number,
    dataset: Dataset,
    commandText: string | null,
  ): void {
    let procName = extractStoredProcName(commandText);
    if (!procName) {
      console.warn(`Could not extract procedure name from: ${commandText}`);
      return;
    }

    let proc = this.repos.storedProc.findByName(procName);
    if (!proc && procName.includes(".")) {
      procName = procName.substring(procName.lastIndexOf(".") + 1);
      proc = this.repos.storedProc.findByName(procName);
    }

    if (proc) {
      this.saveEdge(
        reportId,
        "DATASET",
        dataset.id!,
        dataset.datasetName,
        "PROC",
        proc.id!,
        proc.procName,
        "CALLS",
      );

      if (proc.definition) {
        // Analyze tables referenced by this proc
        this.analyzeAndLinkTables(
          reportId,
          "PROC",
          proc.id!,
          proc.procName,
          proc.definition,
        );
        // Analyze nested proc calls (proc-to-proc chains)
        this.analyzeAndLinkProcs(
          reportId,
          "PROC",
          proc.id!,
          proc.procName,
          proc.definition,
          new Set(),
        );
      }
    } else {
      console.warn(`Stored procedure not found in metadata: ${procName}`);
      this.saveEdge(
        reportId,
        "DATASET",
        dataset.id!,
        dataset.datasetName,
        "PROC_NOT_FOUND" as NodeType,
        -1,
        procName,
        "CALLS",
      );
    }
  }

  private processDirectSql(
    reportId: number,
    dataset: Dataset,
    sql: string | null,
  ): void {
    if (!sql) return;
    this.analyzeAndLinkTables(
      reportId,
      "DATASET",
      dataset.id!,
      dataset.datasetName,
      sql,
    );
  }

  private processSharedDataSet(reportId: number, dataset: Dataset): void {
    const sharedPath = dataset.sharedDatasetPath;
    if (!sharedPath) return;

    let sharedName = sharedPath;
    if (sharedPath.includes("/")) {
      sharedName = sharedPath.substring(sharedPath.lastIndexOf("/") + 1);
    }

    let shared = this.repos.sharedDataset.findByName(sharedName);
    if (!shared) {
      shared = this.repos.sharedDataset.findByPath(sharedPath);
    }

    if (shared) {
      this.saveEdge(
        reportId,
        "DATASET",
        dataset.id!,
        dataset.datasetName,
        "SHARED_DATASET",
        shared.id!,
        shared.datasetName,
        "USES",
      );

      if (shared.commandText) {
        this.analyzeAndLinkTables(
          reportId,
          "SHARED_DATASET",
          shared.id!,
          shared.datasetName,
          shared.commandText,
        );
      }
    } else {
      console.warn(`SharedDataset not found in metadata: ${sharedName}`);
      this.saveEdge(
        reportId,
        "DATASET",
        dataset.id!,
        dataset.datasetName,
        "SHARED_DATASET_NOT_FOUND" as NodeType,
        -1,
        sharedName,
        "USES",
      );
    }
  }

  private analyzeAndLinkTables(
    reportId: number,
    sourceType: string,
    sourceId: number,
    sourceName: string,
    sql: string,
    visitedViews: Set<string> = new Set(),
  ): void {
    // Use sourceId in the key to distinguish between views/procs with the same name but different schemas
    // e.g., bi.vInvTransferPricing (id=1) and syspro.vInvTransferPricing (id=2) are different views
    const viewKey = `${sourceType}:${sourceId}:${sourceName}`;
    if (sourceType === "VIEW" && visitedViews.has(viewKey)) return;
    visitedViews.add(viewKey);

    if (visitedViews.size > 50) {
      console.warn(`Max recursion depth reached while analyzing ${sourceName}`);
      return;
    }

    const regexRefs = extractTables(sql);
    const sqlServerDeps =
      this.repos.procDependency.findByObjectName(sourceName);
    const sqlServerDepNames = new Set(
      sqlServerDeps
        .map((d) => d.dependsOnName?.toLowerCase())
        .filter(Boolean) as string[],
    );

    const processedNames = new Set<string>();

    for (const ref of regexRefs) {
      const refName = ref.tableName.toLowerCase();
      processedNames.add(refName);

      // Determine discovery method based on source type and SQL Server deps
      let discoveryMethod: DiscoveryMethod;
      if (ref.sourceType === "DYNAMIC") {
        discoveryMethod = "DYNAMIC";
      } else if (sqlServerDepNames.has(refName)) {
        discoveryMethod = "BOTH";
      } else {
        discoveryMethod = "REGEX";
      }

      // For external references (LINKED_SERVER, CROSS_DATABASE, DYNAMIC),
      // don't try to look up local views/tables - they are definitively external
      if (ref.sourceType === "DYNAMIC") {
        // DYNAMIC tables: Don't try to match - show as @DYNAMIC.schema.tableName
        // dbo.Table and stage.Table are DIFFERENT tables, no assumptions!
        if (!this.isFalsePositive(ref.tableName)) {
          const dynamicName = `@DYNAMIC.${ref.schema}.${ref.tableName}`;
          this.saveEdge(
            reportId,
            sourceType,
            sourceId,
            sourceName,
            "TABLE_NOT_FOUND" as NodeType,
            -1,
            dynamicName,
            "READS_FROM",
            discoveryMethod,
          );
        }
      } else if (ref.sourceType === "LINKED_SERVER" && ref.server) {
        // LINKED_SERVER: Data comes from external server, NOT from SysproReporting
        // Even if a table with the same name exists locally, the data source is different
        const linkedInfo = this.resolveLinkedServer(ref.server);
        const actualServer = linkedInfo.isKnown
          ? linkedInfo.actualServer
          : "UNKNOWN";

        // Build full name with resolved server info
        const fullName = `[${ref.server}->${actualServer}].${ref.database}.${ref.schema}.${ref.tableName}`;

        // Linked server tables are ALWAYS external - do not look up in local metadata
        // because the data comes from a remote server, not from SysproReporting
        if (!this.isFalsePositive(ref.tableName)) {
          this.saveEdge(
            reportId,
            sourceType,
            sourceId,
            sourceName,
            "TABLE_NOT_FOUND" as NodeType,
            -1,
            fullName,
            "READS_FROM",
            discoveryMethod,
          );
        }
      } else if (ref.sourceType === "CROSS_DATABASE" && ref.database) {
        // CROSS_DATABASE: Data comes from another database (e.g., Calgary, DunnRite)
        // Not from SysproReporting - always mark as external
        const fullName = `${ref.database}.${ref.schema}.${ref.tableName}`;

        if (!this.isFalsePositive(ref.tableName)) {
          this.saveEdge(
            reportId,
            sourceType,
            sourceId,
            sourceName,
            "TABLE_NOT_FOUND" as NodeType,
            -1,
            fullName,
            "READS_FROM",
            discoveryMethod,
          );
        }
      } else {
        // LOCAL: Try to find view or table in local metadata (SysproReporting)
        const view = this.findView(ref);
        if (view) {
          const viewDisplayName = this.formatNameWithSchema(
            view.viewName,
            view.schemaName,
          );
          this.saveEdge(
            reportId,
            sourceType,
            sourceId,
            sourceName,
            "VIEW",
            view.id!,
            viewDisplayName,
            "READS_FROM",
            discoveryMethod,
          );

          if (view.definition) {
            this.analyzeAndLinkTables(
              reportId,
              "VIEW",
              view.id!,
              viewDisplayName,
              view.definition,
              visitedViews,
            );
            // Also check for EXEC statements in view definitions (rare but possible)
            this.analyzeAndLinkProcs(
              reportId,
              "VIEW",
              view.id!,
              viewDisplayName,
              view.definition,
              new Set(),
            );
          }
        } else {
          // Not a view - try to find as table
          const table = this.findTable(ref);
          if (table) {
            this.saveEdge(
              reportId,
              sourceType,
              sourceId,
              sourceName,
              "TABLE",
              table.id!,
              table.tableName,
              "READS_FROM",
              discoveryMethod,
            );
          } else if (!this.isFalsePositive(ref.tableName)) {
            const fullName = [
              ref.server,
              ref.database,
              ref.schema,
              ref.tableName,
            ]
              .filter(Boolean)
              .join(".");
            this.saveEdge(
              reportId,
              sourceType,
              sourceId,
              sourceName,
              "TABLE_NOT_FOUND" as NodeType,
              -1,
              fullName,
              "READS_FROM",
              discoveryMethod,
            );
          }
        }
      }
    }

    // Process SQL Server-only dependencies
    for (const dep of sqlServerDeps) {
      if (!dep.dependsOnName) continue;
      const depName = dep.dependsOnName.toLowerCase();
      if (processedNames.has(depName)) continue;

      // Skip SQL Server functions (table-valued, scalar, etc.)
      const depType = dep.dependsOnType?.toUpperCase() || "";
      if (depType.includes("FUNCTION")) continue;

      if (depType === "VIEW") {
        const view = this.repos.view.findByName(dep.dependsOnName);
        if (view) {
          const viewDisplayName = this.formatNameWithSchema(
            view.viewName,
            view.schemaName,
          );
          this.saveEdge(
            reportId,
            sourceType,
            sourceId,
            sourceName,
            "VIEW",
            view.id!,
            viewDisplayName,
            "READS_FROM",
            "SQL_SERVER",
          );
          if (view.definition) {
            this.analyzeAndLinkTables(
              reportId,
              "VIEW",
              view.id!,
              viewDisplayName,
              view.definition,
              visitedViews,
            );
            // Also check for EXEC statements in view definitions
            this.analyzeAndLinkProcs(
              reportId,
              "VIEW",
              view.id!,
              viewDisplayName,
              view.definition,
              new Set(),
            );
          }
        } else {
          this.saveEdge(
            reportId,
            sourceType,
            sourceId,
            sourceName,
            "VIEW_NOT_FOUND" as NodeType,
            -1,
            dep.dependsOnName,
            "READS_FROM",
            "SQL_SERVER",
          );
        }
      } else {
        const table = this.repos.table.findByName(dep.dependsOnName);
        if (table) {
          this.saveEdge(
            reportId,
            sourceType,
            sourceId,
            sourceName,
            "TABLE",
            table.id!,
            table.tableName,
            "READS_FROM",
            "SQL_SERVER",
          );
        } else {
          const fullName = dep.dependsOnSchema
            ? `${dep.dependsOnSchema}.${dep.dependsOnName}`
            : dep.dependsOnName;
          this.saveEdge(
            reportId,
            sourceType,
            sourceId,
            sourceName,
            "TABLE_NOT_FOUND" as NodeType,
            -1,
            fullName,
            "READS_FROM",
            "SQL_SERVER",
          );
        }
      }
      processedNames.add(depName);
    }
  }

  private analyzeAndLinkProcs(
    reportId: number,
    sourceType: string,
    sourceId: number,
    sourceName: string,
    sql: string,
    visitedProcs: Set<string>,
    depth: number = 1,
  ): void {
    // Limit recursion to 5 levels to prevent infinite loops
    if (depth > 5) {
      console.warn(`Max proc chain depth (5) reached for ${sourceName}`);
      return;
    }

    const procKey = `${sourceType}:${sourceName}`;
    if (visitedProcs.has(procKey)) return;
    visitedProcs.add(procKey);

    // Extract procedure calls from SQL
    const procCalls = extractProcedureCalls(sql);

    for (const procCall of procCalls) {
      // Try to find the called procedure in metadata
      let calledProc = this.repos.storedProc.findByName(procCall.procName);
      if (!calledProc && procCall.schema) {
        // Try with schema prefix
        calledProc = this.repos.storedProc.findByName(
          `${procCall.schema}.${procCall.procName}`,
        );
      }

      if (calledProc) {
        // Save PROC -> PROC edge
        this.saveEdge(
          reportId,
          sourceType,
          sourceId,
          sourceName,
          "PROC",
          calledProc.id!,
          calledProc.procName,
          "CALLS",
          "REGEX",
        );

        // Recursively analyze the called proc
        if (calledProc.definition) {
          // Analyze tables referenced by this nested proc
          this.analyzeAndLinkTables(
            reportId,
            "PROC",
            calledProc.id!,
            calledProc.procName,
            calledProc.definition,
          );
          // Continue recursion for proc-to-proc chains
          this.analyzeAndLinkProcs(
            reportId,
            "PROC",
            calledProc.id!,
            calledProc.procName,
            calledProc.definition,
            visitedProcs,
            depth + 1,
          );
        }
      } else {
        // Proc not found - save as PROC_NOT_FOUND
        const fullName = procCall.schema
          ? `${procCall.schema}.${procCall.procName}`
          : procCall.procName;
        this.saveEdge(
          reportId,
          sourceType,
          sourceId,
          sourceName,
          "PROC_NOT_FOUND" as NodeType,
          -1,
          fullName,
          "CALLS",
          "REGEX",
        );
      }
    }
  }

  private findView(ref: TableReference) {
    if (ref.schema) {
      return this.repos.view.findBySchemaAndName(ref.schema, ref.tableName);
    }
    return this.repos.view.findByName(ref.tableName);
  }

  private findTable(ref: TableReference) {
    if (ref.server && ref.database && ref.schema) {
      return this.repos.table.findByFullName(
        ref.server,
        ref.database,
        ref.schema,
        ref.tableName,
      );
    }
    if (ref.schema) {
      return this.repos.table.findBySchemaAndName(ref.schema, ref.tableName);
    }
    return this.repos.table.findByName(ref.tableName);
  }

  // Find table by name only, for dynamic SQL where server/database are variables
  private findTableByNameOnly(tableName: string, schema: string | null) {
    // First try with schema
    if (schema) {
      const withSchema = this.repos.table.findBySchemaAndName(
        schema,
        tableName,
      );
      if (withSchema) return withSchema;
    }
    // Fall back to name only
    return this.repos.table.findByName(tableName);
  }

  private saveEdge(
    reportId: number,
    sourceType: string,
    sourceId: number,
    sourceName: string,
    targetType: string,
    targetId: number,
    targetName: string,
    relationship: string,
    discoveryMethod: DiscoveryMethod = "REGEX",
  ): void {
    const edge: LineageEdge = {
      id: null,
      reportId,
      sourceType: sourceType as NodeType,
      sourceId,
      sourceName,
      targetType: targetType as NodeType,
      targetId,
      targetName,
      relationship: relationship as Relationship,
      discoveryMethod,
    };
    this.repos.lineage.save(edge);
  }

  getLineageGraph(reportId: number): LineageGraphDto {
    const report = this.repos.report.findById(reportId);
    if (!report) throw new Error(`Report not found: ${reportId}`);

    const edges = this.repos.lineage.findByReportId(reportId);
    const nodesMap = new Map<string, LineageNodeDto>();
    // Store both ID and name so we can fall back to name lookup if ID is stale after metadata reload
    const procEntries = new Map<number, string>(); // id -> name
    const viewEntries = new Map<number, string>(); // id -> name

    for (const edge of edges) {
      const sourceKey = this.buildNodeKey(
        edge.sourceType,
        edge.sourceId,
        edge.sourceName,
      );
      if (!nodesMap.has(sourceKey)) {
        nodesMap.set(
          sourceKey,
          this.buildNode(edge.sourceType, edge.sourceId, edge.sourceName),
        );
      }
      if (edge.sourceType === "PROC" && edge.sourceId > 0)
        procEntries.set(edge.sourceId, edge.sourceName || "");
      if (edge.sourceType === "VIEW" && edge.sourceId > 0)
        viewEntries.set(edge.sourceId, edge.sourceName || "");

      const targetKey = this.buildNodeKey(
        edge.targetType,
        edge.targetId,
        edge.targetName,
      );
      if (!nodesMap.has(targetKey)) {
        nodesMap.set(
          targetKey,
          this.buildNode(edge.targetType, edge.targetId, edge.targetName),
        );
      }
      if (edge.targetType === "PROC" && edge.targetId > 0)
        procEntries.set(edge.targetId, edge.targetName || "");
      if (edge.targetType === "VIEW" && edge.targetId > 0)
        viewEntries.set(edge.targetId, edge.targetName || "");
    }

    const edgeDtos: LineageEdgeDto[] = edges.map((e) => ({
      source: this.buildNodeKey(e.sourceType, e.sourceId, e.sourceName),
      target: this.buildNodeKey(e.targetType, e.targetId, e.targetName),
      relationship: e.relationship,
      discoveryMethod: e.discoveryMethod,
    }));

    const warnings: ParsingWarningDto[] = [];
    const seenWarnings = new Set<string>();

    for (const edge of edges) {
      const warningKey = `${edge.targetType}:${edge.targetName}`;
      if (seenWarnings.has(warningKey)) continue;
      seenWarnings.add(warningKey);

      if (edge.targetType === "PROC_NOT_FOUND") {
        warnings.push({
          entityType: "PROC",
          entityName: edge.targetName || "",
          warning: "Stored procedure not found in metadata",
        });
      } else if (edge.targetType === "SHARED_DATASET_NOT_FOUND") {
        warnings.push({
          entityType: "SHARED_DATASET",
          entityName: edge.targetName || "",
          warning: "SharedDataset not found in metadata",
        });
      } else if (edge.targetType === "TABLE_NOT_FOUND") {
        warnings.push({
          entityType: "TABLE",
          entityName: edge.targetName || "",
          warning: "Table not found in metadata",
        });
      }
    }

    for (const [procId, procName] of procEntries) {
      // Try by ID first, fall back to name (IDs can become stale after metadata reload)
      let proc = this.repos.storedProc.findById(procId);
      if (!proc && procName) proc = this.repos.storedProc.findByName(procName);
      if (proc?.definition) {
        for (const w of detectDynamicSqlWarnings(proc.definition)) {
          const key = `PROC:${proc.procName}:${w}`;
          if (!seenWarnings.has(key)) {
            seenWarnings.add(key);
            warnings.push({
              entityType: "PROC",
              entityName: proc.procName,
              warning: w,
            });
          }
        }
      }
    }

    for (const [viewId, viewName] of viewEntries) {
      // Try by ID first, fall back to name (IDs can become stale after metadata reload)
      let view = this.repos.view.findById(viewId);
      if (!view && viewName) view = this.repos.view.findByName(viewName);
      if (view?.definition) {
        for (const w of detectDynamicSqlWarnings(view.definition)) {
          const key = `VIEW:${view.viewName}:${w}`;
          if (!seenWarnings.has(key)) {
            seenWarnings.add(key);
            warnings.push({
              entityType: "VIEW",
              entityName: view.viewName,
              warning: w,
            });
          }
        }
      }
    }

    return {
      reportId,
      reportName: report.reportName || report.fileName,
      lastAnalyzed: report.lastRunAt
        ? dayjs(report.lastRunAt).format("MMM D, YYYY h:mm A")
        : null,
      nodes: Array.from(nodesMap.values()),
      edges: edgeDtos,
      warnings,
    };
  }

  private buildNodeKey(
    type: string,
    id: number | null,
    name: string | null,
  ): string {
    if (!id || id <= 0) {
      const safeName = name ? name.replace(/[^a-zA-Z0-9]/g, "_") : "unknown";
      return `${type}_${safeName}`;
    }
    return `${type}_${id}`;
  }

  private buildNode(
    type: string,
    id: number | null,
    name: string | null,
  ): LineageNodeDto {
    const nodeId = this.buildNodeKey(type, id, name);
    const node: LineageNodeDto = {
      id: nodeId,
      name: name || "",
      type,
      server: null,
      database: null,
      schema: null,
      hasPk: null,
      sourceType: null,
    };

    if (
      [
        "PROC_NOT_FOUND",
        "SHARED_DATASET_NOT_FOUND",
        "TABLE_NOT_FOUND",
        "VIEW_NOT_FOUND",
      ].includes(type)
    ) {
      node.sourceType = "ERROR";
    }

    // Check for LINKED SERVER format: [ALIAS->ACTUAL_SERVER].database.schema.table
    if (name && name.startsWith("[") && name.includes("->")) {
      const linkedMatch = name.match(
        /^\[([^-]+)->([^\]]+)\]\.([^.]+)\.([^.]+)\.(.+)$/,
      );
      if (linkedMatch) {
        const [, alias, actualServer, database, schema, tableName] =
          linkedMatch;
        node.server = `LINKED SERVER: ${alias} -> ${actualServer}`;
        node.database = database;
        node.schema = schema;
        node.name = tableName;
        node.sourceType = "LINKED_SERVER";
        return node;
      }
    }

    // Check for DYNAMIC format: @DYNAMIC.schema.table
    if (name && name.startsWith("@DYNAMIC.")) {
      const parts = name.split(".");
      if (parts.length === 3) {
        node.server = "DYNAMIC SQL";
        node.database = "@DYNAMIC";
        node.schema = parts[1];
        node.name = parts[2];
        node.sourceType = "DYNAMIC";
        return node;
      }
    }

    if (type === "TABLE" && id && id > 0) {
      const table = this.repos.table.findById(id);
      if (table) {
        node.server = table.server;
        node.database = table.databaseName;
        node.schema = table.schemaName;
        node.hasPk = table.hasPk;
        node.sourceType = table.sourceType;
      }
    } else if (type === "TABLE" && name) {
      const parts = name.split(".");
      if (parts.length === 4) {
        node.server = parts[0];
        node.database = parts[1];
        node.schema = parts[2];
        node.sourceType = "LINKED_SERVER";
      } else if (parts.length >= 2) {
        node.schema = parts[parts.length - 2];
        node.sourceType = "UNKNOWN";
      }
    }

    return node;
  }

  getSourceTables(reportId: number): SourceTableDto[] {
    const tableEdges = this.repos.lineage.findTableEdgesByReportId(reportId);
    const seen = new Map<string, SourceTableDto>();

    for (const edge of tableEdges) {
      // Create unique key based on target
      const key =
        edge.targetId > 0 ? `id:${edge.targetId}` : `name:${edge.targetName}`;

      // Skip if already processed (deduplication)
      if (seen.has(key)) continue;

      const isNotFound = edge.targetType === "TABLE_NOT_FOUND";
      const targetName = edge.targetName || "";

      const dto: SourceTableDto = {
        id: 0,
        server: null,
        databaseName: null,
        schemaName: "",
        tableName: targetName,
        hasPk: null,
        sourceType: null,
        discoveryMethod: edge.discoveryMethod,
        status: isNotFound ? "No" : "Yes",
        isAvailableInNewSyspro: null,
      };

      if (edge.targetId > 0) {
        const table = this.repos.table.findById(edge.targetId);
        if (table) {
          dto.id = table.id!;
          dto.tableName = table.tableName;
          dto.schemaName = table.schemaName;
          dto.databaseName = table.databaseName;
          dto.server = table.server;
          dto.sourceType = table.sourceType;
          dto.hasPk = table.hasPk;
          // Check if table exists in TRN1 (new Syspro)
          const trn1Match = this.findInTrn1(table.tableName);
          dto.isAvailableInNewSyspro = trn1Match.found;
          // Use TRN1 schema if found and current schema is empty
          if (trn1Match.found && trn1Match.schema && !dto.schemaName) {
            dto.schemaName = trn1Match.schema;
          }
        }
      } else {
        // Handle linked server format: [ALIAS->ACTUAL].database.schema.table
        const linkedMatch = targetName.match(
          /^\[([^-]+)->([^\]]+)\]\.([^.]+)\.([^.]+)\.(.+)$/,
        );
        if (linkedMatch) {
          const [, alias, actualServer, database, schema, tableName] =
            linkedMatch;
          dto.server = `${alias} -> ${actualServer}`;
          dto.databaseName = database;
          dto.schemaName = schema;
          dto.tableName = tableName;
          dto.sourceType = "LINKED_SERVER";
        }
        // Handle dynamic SQL format: @DYNAMIC.schema.table
        else if (targetName.startsWith("@DYNAMIC.")) {
          const parts = targetName.split(".");
          if (parts.length === 3) {
            dto.server = "DYNAMIC SQL";
            dto.databaseName = "@DYNAMIC";
            dto.schemaName = parts[1];
            dto.tableName = parts[2];
            dto.sourceType = "DYNAMIC";
          }
        }
        // Handle regular 4-part names
        else {
          const parts = targetName.split(".");
          if (parts.length === 4) {
            dto.server = parts[0];
            dto.databaseName = parts[1];
            dto.schemaName = parts[2];
            dto.tableName = parts[3];
            dto.sourceType = "LINKED_SERVER";
          } else if (parts.length === 3) {
            dto.databaseName = parts[0];
            dto.schemaName = parts[1];
            dto.tableName = parts[2];
            dto.sourceType = "UNKNOWN";
          } else if (parts.length === 2) {
            dto.schemaName = parts[0];
            dto.tableName = parts[1];
            dto.sourceType = "UNKNOWN";
          }
        }

        // For all "not found" cases, check TRN1 availability using the parsed table name
        const trn1Match = this.findInTrn1(dto.tableName);
        dto.isAvailableInNewSyspro = trn1Match.found;
        // Use TRN1 schema if found and current schema is empty
        if (trn1Match.found && trn1Match.schema && !dto.schemaName) {
          dto.schemaName = trn1Match.schema;
        }
      }

      seen.set(key, dto);
    }

    const results = Array.from(seen.values());

    // If no tables found, return a placeholder row explaining why
    if (results.length === 0) {
      // Check what datasets exist to provide context
      const datasets = this.repos.dataset.findByReportId(reportId);
      let reason = "No table references found in query";

      if (datasets.length === 0) {
        reason = "Report has no datasets";
      } else {
        // Check if queries look like parameter parsing or non-table operations
        const hasOnlyParamQueries = datasets.every((ds) => {
          const cmd = (ds.commandText || "").toUpperCase();
          return (
            !cmd.includes("FROM ") ||
            (cmd.includes("CAST(") && cmd.includes("XML")) ||
            (cmd.includes("@") && !cmd.match(/FROM\s+[a-zA-Z]/))
          );
        });
        if (hasOnlyParamQueries) {
          reason = "Query only contains parameter parsing (no table access)";
        }
      }

      results.push({
        id: 0,
        server: null,
        databaseName: null,
        schemaName: "-",
        tableName: reason,
        hasPk: null,
        sourceType: "N/A",
        discoveryMethod: "N/A",
        status: "NO_TABLES",
        isAvailableInNewSyspro: null,
      });
    }

    return results;
  }

  private isFalsePositive(tableName: string): boolean {
    if (!tableName || tableName.length < 4) return true;
    const upper = tableName.toUpperCase();
    if (FALSE_POSITIVES.has(upper)) return true;
    if (/SQL\d+$/i.test(upper)) return true;
    if (tableName.length <= 8 && tableName === tableName.toUpperCase()) {
      if (!/(TBL|TABLE|LOG|HIST|DATA|INFO|DETAIL|HDR|DTL)$/i.test(upper))
        return true;
    }
    return false;
  }

  exportLineageToCsv(reportId: number): string {
    const report = this.repos.report.findById(reportId);
    if (!report) throw new Error(`Report not found: ${reportId}`);
    return this.buildLineageCsv([report]);
  }

  exportAllLineageToCsv(): string {
    const reports = this.repos.report
      .findAll()
      .filter((r) => r.status === "COMPLETED");
    return this.buildLineageCsv(reports);
  }

  exportStarredLineageToCsv(reportIds: number[]): string {
    const reports = reportIds
      .map((id) => this.repos.report.findById(id))
      .filter((r) => r && r.status === "COMPLETED");
    return this.buildLineageCsv(reports);
  }

  /**
   * Export lineage for starred reports including linked reports with their own names
   * @param reportInfos Array of { templateId, displayName, displayPath } objects
   */
  exportStarredLineageWithLinkedToCsv(
    reportInfos: Array<{
      templateId: number;
      displayName: string;
      displayPath: string;
    }>,
  ): string {
    // Group by templateId to avoid duplicate lineage lookups
    const byTemplate = new Map<
      number,
      Array<{ displayName: string; displayPath: string }>
    >();
    for (const info of reportInfos) {
      if (!byTemplate.has(info.templateId)) {
        byTemplate.set(info.templateId, []);
      }
      byTemplate
        .get(info.templateId)!
        .push({ displayName: info.displayName, displayPath: info.displayPath });
    }

    return this.buildLineageCsvWithDisplayInfo(byTemplate);
  }

  /**
   * Generate additional CSV rows for tables found through deeper tracing
   * These are tables not directly in the lineage TABLE edges but found through VIEW/PROC tracing
   */
  generateAdditionalTableRows(
    reportName: string,
    reportPath: string,
    additionalTables: Array<{ schema: string; tableName: string }>,
    existingTables: Set<string>,
  ): string {
    let csv = "";
    for (const table of additionalTables) {
      const key = `${table.schema}.${table.tableName}`.toLowerCase();
      if (existingTables.has(key)) continue;

      // Look up table to get hasPk
      const tableRecord =
        this.repos.table.findByName(`${table.schema}.${table.tableName}`) ||
        this.repos.table.findByName(table.tableName);
      const hasPk =
        tableRecord?.hasPk === true
          ? "Yes"
          : tableRecord?.hasPk === false
            ? "No"
            : "-";

      csv += this.formatCsvRow({
        reportType: "SSRS",
        reportName: reportName,
        reportPath: reportPath,
        datasetName: "",
        datasetType: "Deep Trace",
        procs: [],
        views: [],
        comment: "Found via VIEW/PROC tracing",
        metadataTable: table.tableName,
        metadataSchema: table.schema,
        sourceServer: "",
        sourceDatabase: "",
        status: "Yes",
        hasPk: hasPk,
      });
    }
    return csv;
  }

  private buildLineageCsv(reports: any[]): string {
    // CSV header - matches old Excel format with Proc1-10, View1-10
    const header =
      [
        "ReportType",
        "Report Name",
        "Report Path",
        "Dataset",
        "Dataset Type",
        "Proc1",
        "Proc2",
        "Proc3",
        "Proc4",
        "Proc5",
        "Proc6",
        "Proc7",
        "Proc8",
        "Proc9",
        "Proc10",
        "View1",
        "View2",
        "View3",
        "View4",
        "View5",
        "View6",
        "View7",
        "View8",
        "View9",
        "View10",
        "Comment",
        "Table",
        "Schema",
        "Server",
        "Database",
        "In SQL2(D300SQLDW01)",
        "SQL2(D300SQLDW01) Has PK",
      ].join(",") + "\n";

    let csv = header;

    for (const report of reports) {
      const edges = this.repos.lineage.findByReportId(report.id);
      const datasets = this.repos.dataset.findByReportId(report.id);
      const datasetMap = new Map(datasets.map((ds) => [ds.id, ds]));

      // Get XML server/database from data sources
      const dataSources = this.repos.dataSource.findByReportId(report.id);
      let xmlServer = "",
        xmlDatabase = "";
      for (const ds of dataSources) {
        // Lookup metadata from shared_data_sources table
        if (ds.referencePath) {
          const sharedDs = this.repos.sharedDataSource.findByPath(
            ds.referencePath,
          );
          if (sharedDs) {
            xmlServer = sharedDs.server || "";
            xmlDatabase = sharedDs.databaseName || "";
            break;
          }
        }
        // Fallback to XML-extracted values
        if (!xmlServer && ds.server) xmlServer = ds.server;
        if (!xmlDatabase && ds.databaseName) xmlDatabase = ds.databaseName;
      }

      // Get table edges
      const tableEdges = edges.filter((e) => e.targetType.includes("TABLE"));

      if (tableEdges.length === 0) {
        // No tables found - add a row for each dataset showing why
        if (datasets.length === 0) {
          // No datasets at all
          csv += this.formatCsvRow({
            reportType: "SSRS",
            reportName: report.reportName,
            reportPath: report.filePath || "",
            datasetName: "",
            datasetType: "",
            procs: [],
            views: [],
            comment: "",
            metadataTable: "No datasets in report",
            metadataSchema: "",
            sourceServer: xmlServer,
            sourceDatabase: xmlDatabase,
            status: "NO TABLES",
            hasPk: "-",
          });
        } else {
          // Has datasets but no table references
          for (const ds of datasets) {
            csv += this.formatCsvRow({
              reportType: "SSRS",
              reportName: report.reportName,
              reportPath: report.filePath || "",
              datasetName: ds.datasetName,
              datasetType: ds.commandType || "",
              procs: [],
              views: [],
              comment: "",
              metadataTable: "No table references found",
              metadataSchema: "",
              sourceServer: xmlServer,
              sourceDatabase: xmlDatabase,
              status: "NO TABLES",
              hasPk: "-",
            });
          }
        }
        continue;
      }

      for (const edge of tableEdges) {
        const chain = this.buildChain(edges, datasetMap, edge);
        let tableName = edge.targetName || "";
        let schema = "",
          status = "Yes",
          hasPk = "-";

        if (edge.targetType === "TABLE") {
          // First try lookup by ID
          let table =
            edge.targetId > 0
              ? this.repos.table.findById(edge.targetId)
              : undefined;
          // If not found by ID (stale reference), try by name
          if (!table && edge.targetName) {
            table = this.repos.table.findByName(edge.targetName);
          }
          if (table) {
            tableName = table.tableName;
            schema = table.schemaName || "";
            hasPk =
              table.hasPk === true ? "Yes" : table.hasPk === false ? "No" : "-";
          } else {
            // Table not found at all - mark as not found
            status = "No";
            const parts = (edge.targetName || "").split(".");
            if (parts.length >= 2) {
              schema = parts[parts.length - 2];
              tableName = parts[parts.length - 1];
            }
          }
        } else if (edge.targetType === "TABLE_NOT_FOUND") {
          status = "No";
          const parts = (edge.targetName || "").split(".");
          if (parts.length === 4) {
            [, , schema, tableName] = parts;
          } else if (parts.length === 3) {
            [, schema, tableName] = parts;
          } else if (parts.length === 2) {
            [schema, tableName] = parts;
          }
        }

        csv += this.formatCsvRow({
          reportType: "SSRS",
          reportName: report.reportName,
          reportPath: report.filePath || "",
          datasetName: chain.datasetName,
          datasetType: chain.datasetType,
          procs: chain.procs,
          views: chain.views,
          comment: chain.comment,
          metadataTable: tableName,
          metadataSchema: schema,
          sourceServer: xmlServer,
          sourceDatabase: xmlDatabase,
          status,
          hasPk,
        });
      }
    }

    return csv;
  }

  /**
   * Build lineage CSV with display info for linked reports
   * Each template may have multiple display entries (template itself + linked reports)
   */
  private buildLineageCsvWithDisplayInfo(
    byTemplate: Map<
      number,
      Array<{ displayName: string; displayPath: string }>
    >,
  ): string {
    const header =
      [
        "ReportType",
        "Report Name",
        "Report Path",
        "Dataset",
        "Dataset Type",
        "Proc1",
        "Proc2",
        "Proc3",
        "Proc4",
        "Proc5",
        "Proc6",
        "Proc7",
        "Proc8",
        "Proc9",
        "Proc10",
        "View1",
        "View2",
        "View3",
        "View4",
        "View5",
        "View6",
        "View7",
        "View8",
        "View9",
        "View10",
        "Comment",
        "Table",
        "Schema",
        "Server",
        "Database",
        "In SQL2(D300SQLDW01)",
        "SQL2(D300SQLDW01) Has PK",
      ].join(",") + "\n";

    let csv = header;

    for (const [templateId, displayInfos] of byTemplate) {
      const report = this.repos.report.findById(templateId);
      if (!report || report.status !== "COMPLETED") continue;

      const edges = this.repos.lineage.findByReportId(report.id!);
      const datasets = this.repos.dataset.findByReportId(report.id!);
      const datasetMap = new Map(datasets.map((ds) => [ds.id, ds]));

      // Get XML server/database from data sources
      const dataSources = this.repos.dataSource.findByReportId(report.id!);
      let xmlServer = "",
        xmlDatabase = "";
      for (const ds of dataSources) {
        if (ds.referencePath) {
          const sharedDs = this.repos.sharedDataSource.findByPath(
            ds.referencePath,
          );
          if (sharedDs) {
            xmlServer = sharedDs.server || "";
            xmlDatabase = sharedDs.databaseName || "";
            break;
          }
        }
        if (!xmlServer && ds.server) xmlServer = ds.server;
        if (!xmlDatabase && ds.databaseName) xmlDatabase = ds.databaseName;
      }

      // For each display entry (could be template or linked report), output the lineage
      for (const displayInfo of displayInfos) {
        const tableEdges = edges.filter((e) => e.targetType.includes("TABLE"));

        if (tableEdges.length === 0) {
          if (datasets.length === 0) {
            csv += this.formatCsvRow({
              reportType: "SSRS",
              reportName: displayInfo.displayName,
              reportPath: displayInfo.displayPath,
              datasetName: "",
              datasetType: "",
              procs: [],
              views: [],
              comment: "",
              metadataTable: "No datasets in report",
              metadataSchema: "",
              sourceServer: xmlServer,
              sourceDatabase: xmlDatabase,
              status: "NO TABLES",
              hasPk: "-",
            });
          } else {
            for (const ds of datasets) {
              csv += this.formatCsvRow({
                reportType: "SSRS",
                reportName: displayInfo.displayName,
                reportPath: displayInfo.displayPath,
                datasetName: ds.datasetName,
                datasetType: ds.commandType || "",
                procs: [],
                views: [],
                comment: "",
                metadataTable: "No table references found",
                metadataSchema: "",
                sourceServer: xmlServer,
                sourceDatabase: xmlDatabase,
                status: "NO TABLES",
                hasPk: "-",
              });
            }
          }
          continue;
        }

        for (const edge of tableEdges) {
          const chain = this.buildChain(edges, datasetMap, edge);
          let tableName = edge.targetName || "";
          let schema = "",
            status = "Yes",
            hasPk = "-";

          if (edge.targetType === "TABLE") {
            // First try lookup by ID
            let table =
              edge.targetId > 0
                ? this.repos.table.findById(edge.targetId)
                : undefined;
            // If not found by ID (stale reference), try by name
            if (!table && edge.targetName) {
              table = this.repos.table.findByName(edge.targetName);
            }
            if (table) {
              tableName = table.tableName;
              schema = table.schemaName || "";
              hasPk =
                table.hasPk === true
                  ? "Yes"
                  : table.hasPk === false
                    ? "No"
                    : "-";
            } else {
              // Table not found at all - mark as not found
              status = "No";
              const parts = (edge.targetName || "").split(".");
              if (parts.length >= 2) {
                schema = parts[parts.length - 2];
                tableName = parts[parts.length - 1];
              }
            }
          } else if (edge.targetType === "TABLE_NOT_FOUND") {
            status = "No";
            const parts = (edge.targetName || "").split(".");
            if (parts.length === 4) {
              [, , schema, tableName] = parts;
            } else if (parts.length === 3) {
              [, schema, tableName] = parts;
            } else if (parts.length === 2) {
              [schema, tableName] = parts;
            }
          }

          csv += this.formatCsvRow({
            reportType: "SSRS",
            reportName: displayInfo.displayName,
            reportPath: displayInfo.displayPath,
            datasetName: chain.datasetName,
            datasetType: chain.datasetType,
            procs: chain.procs,
            views: chain.views,
            comment: chain.comment,
            metadataTable: tableName,
            metadataSchema: schema,
            sourceServer: xmlServer,
            sourceDatabase: xmlDatabase,
            status,
            hasPk,
          });
        }
      }
    }

    return csv;
  }

  private formatCsvRow(row: {
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
      procCols.push(this.escapeCsv(row.procs[i] || ""));
    }

    const viewCols: string[] = [];
    for (let i = 0; i < 10; i++) {
      viewCols.push(this.escapeCsv(row.views[i] || ""));
    }

    return (
      [
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
      ].join(",") + "\n"
    );
  }

  private buildChain(
    edges: LineageEdge[],
    datasetMap: Map<number | null, Dataset>,
    tableEdge: LineageEdge,
  ) {
    // Separate arrays for procs and views
    const chain = {
      datasetName: "",
      datasetType: "",
      procs: [] as string[],
      views: [] as string[],
      comment: "",
    };

    // Build a lookup map from target to source edges for easier traversal
    const edgesByTarget = new Map<string, LineageEdge[]>();
    for (const e of edges) {
      const key = `${e.targetType}:${e.targetName}`;
      if (!edgesByTarget.has(key)) edgesByTarget.set(key, []);
      edgesByTarget.get(key)!.push(e);
    }

    // Walk backwards from the table edge to the dataset, collecting procs and views
    let currentType = tableEdge.sourceType;
    let currentName = tableEdge.sourceName;
    let currentId = tableEdge.sourceId;
    const visited = new Set<string>();

    while (currentType && currentName) {
      const key = `${currentType}:${currentName}`;
      if (visited.has(key)) break; // Prevent infinite loops
      visited.add(key);

      if (currentType === "VIEW") {
        // Look up schema for view - try by ID first, fall back to name
        // (IDs can become stale after metadata reload)
        let viewName = currentName;
        let view =
          currentId && currentId > 0
            ? this.repos.view.findById(currentId)
            : null;
        if (!view && currentName)
          view = this.repos.view.findByName(currentName);
        if (view && view.schemaName) {
          viewName = `${view.schemaName}.${view.viewName}`;
        }
        chain.views.unshift(viewName);
      } else if (currentType === "PROC") {
        // Look up schema for proc - try by ID first, fall back to name
        // (IDs can become stale after metadata reload)
        let procName = currentName;
        let proc =
          currentId && currentId > 0
            ? this.repos.storedProc.findById(currentId)
            : null;
        if (!proc && currentName)
          proc = this.repos.storedProc.findByName(currentName);
        if (proc && proc.schemaName) {
          procName = `${proc.schemaName}.${proc.procName}`;
        }
        chain.procs.unshift(procName);
      } else if (currentType === "DATASET") {
        const ds = datasetMap.get(currentId);
        if (ds) {
          chain.datasetName = ds.datasetName;
          chain.datasetType = ds.commandType || "";
        }
        break; // Reached the dataset, stop walking
      } else if (currentType === "SHARED_DATASET") {
        chain.datasetType = "SharedDataSet";
        // Continue to find the dataset that uses this shared dataset
      }

      // Find the edge that points to the current node
      const incomingEdges = edgesByTarget.get(key) || [];
      if (incomingEdges.length === 0) break;

      // Take the first incoming edge
      const incoming = incomingEdges[0];
      currentType = incoming.sourceType;
      currentName = incoming.sourceName || "";
      currentId = incoming.sourceId;
    }

    // Handle overflow (more than 10 procs or views)
    const comments: string[] = [];
    if (chain.procs.length > 10) {
      const overflow = chain.procs.slice(10);
      comments.push(`Additional Procs: ${overflow.join(", ")}`);
      chain.procs = chain.procs.slice(0, 10);
    }
    if (chain.views.length > 10) {
      const overflow = chain.views.slice(10);
      comments.push(`Additional Views: ${overflow.join(", ")}`);
      chain.views = chain.views.slice(0, 10);
    }
    chain.comment = comments.join("; ");

    return chain;
  }

  private escapeCsv(value: string | null): string {
    if (!value) return "";
    // Replace Unicode arrows and other special chars with ASCII equivalents
    let sanitized = value
      .replace(/→/g, "->")
      .replace(/←/g, "<-")
      .replace(/↔/g, "<->")
      .replace(/–/g, "-") // en-dash
      .replace(/—/g, "--"); // em-dash

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
