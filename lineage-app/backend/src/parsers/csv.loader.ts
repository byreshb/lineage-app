import { parse } from 'csv-parse/sync';
import fs from 'fs';
import { StoredProcedure, View, SourceTable, SharedDataset, SharedDataSource, LinkedServer, ProcDependency, ReportExecutionHistory, ReportExecution, Trn1Schema } from '../types/index.js';

function cleanString(value: string | undefined | null): string {
  if (!value) return '';
  // Remove BOM and trim
  return value.replace('\uFEFF', '').trim();
}

function parseInteger(value: string | undefined | null): number | null {
  if (!value || value.trim() === '') return null;
  try {
    const cleaned = value.trim().replace(/,/g, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? null : num;
  } catch {
    return null;
  }
}

function parseBoolean(value: string | undefined | null): boolean | null {
  if (!value || value.trim() === '') return null;
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

export function loadStoredProcedures(csvFilePath: string): StoredProcedure[] {
  const procedures: StoredProcedure[] = [];
  const content = fs.readFileSync(csvFilePath, 'utf-8');
  const records = parse(content, { relax_column_count: true });

  for (const line of records) {
    if (line.length >= 2) {
      const schema = cleanString(line[0]);
      const procName = cleanString(line[1]);

      // Skip header row if present
      if (schema.toLowerCase() === 'schema' || schema.toLowerCase() === 'schema_name') {
        continue;
      }

      procedures.push({
        id: null,
        schemaName: schema,
        procName: procName,
        definition: line.length > 2 ? line[2] : null,
      });
    }
  }

  console.log(`Loaded ${procedures.length} stored procedures from ${csvFilePath}`);
  return procedures;
}

export function loadViews(csvFilePath: string): View[] {
  const views: View[] = [];
  const content = fs.readFileSync(csvFilePath, 'utf-8');
  const records = parse(content, { relax_column_count: true });

  // Detect format:
  // Format A (4 cols): Database, SchemaName, ViewName, ViewDefinition (new multi-db format)
  // Format B (3 cols): SchemaName, ViewName, ViewDefinition (old single-db format)
  let format: 'A' | 'B' = 'B';

  if (records.length > 0) {
    const col0 = cleanString(records[0][0]).toLowerCase();
    const col1 = records[0].length > 1 ? cleanString(records[0][1]).toLowerCase() : '';

    // Check if first column is a header
    if (col0 === 'database' || col0 === 'databasename') {
      format = 'A';
    }
    // Check if second column looks like a schema name (dbo, syspro, etc.) - indicates Format A
    else if (['dbo', 'syspro', 'stage', 'bi', 'etl', 'raw', 'dim', 'fact'].includes(col1)) {
      format = 'A';
    }
    // Check if first column is NOT a typical schema name - likely a database name (Format A)
    else if (!['dbo', 'syspro', 'stage', 'bi', 'etl', 'raw', 'dim', 'fact', 'schema', 'schemaname', 'schema_name'].includes(col0)) {
      // First column doesn't look like a schema, assume it's a database name
      format = 'A';
    }
  }

  console.log(`Detected views CSV format: ${format === 'A' ? 'Database,Schema,View,Definition' : 'Schema,View,Definition'}`);

  for (const line of records) {
    if (format === 'A' && line.length >= 3) {
      // Format A: Database, SchemaName, ViewName, ViewDefinition
      const database = cleanString(line[0]);
      const schema = cleanString(line[1]);
      const viewName = cleanString(line[2]);

      // Skip header row
      if (database.toLowerCase() === 'database' || database.toLowerCase() === 'databasename') {
        continue;
      }

      views.push({
        id: null,
        databaseName: database || null,
        schemaName: schema,
        viewName: viewName,
        definition: line.length > 3 ? line[3] : null,
      });
    } else if (line.length >= 2) {
      // Format B: SchemaName, ViewName, ViewDefinition
      const schema = cleanString(line[0]);
      const viewName = cleanString(line[1]);

      // Skip header row if present
      if (schema.toLowerCase() === 'schema' || schema.toLowerCase() === 'schema_name' || schema.toLowerCase() === 'schemaname') {
        continue;
      }

      views.push({
        id: null,
        databaseName: 'SysproReporting', // Default for old format
        schemaName: schema,
        viewName: viewName,
        definition: line.length > 2 ? line[2] : null,
      });
    }
  }

  console.log(`Loaded ${views.length} views from ${csvFilePath}`);
  return views;
}

export function loadTables(csvFilePath: string): SourceTable[] {
  const tables: SourceTable[] = [];
  const content = fs.readFileSync(csvFilePath, 'utf-8');
  const records = parse(content, { relax_column_count: true });

  // Detect format:
  // Format A (5 cols): ServerName, DatabaseName, SchemaName, TableName, HasPK
  // Format B (4 cols): DatabaseName, SchemaName, TableName, HasPK
  // Format C (4 cols - old): SchemaName, TableName, RowCount, HasPK
  const COMMON_SCHEMAS = ['dbo', 'sys', 'syspro', 'stage', 'bi', 'archive', 'xref', 'etl', 'report', 'ssrs'];

  let format: 'A' | 'B' | 'C' = 'C'; // Default to old format

  if (records.length > 0) {
    const numCols = records[0].length;
    const col0 = cleanString(records[0][0]).toLowerCase();
    const col1 = cleanString(records[0][1]).toLowerCase();
    const col2 = numCols > 2 ? cleanString(records[0][2]).toLowerCase() : '';

    if (numCols >= 5) {
      // 5 columns: Server, Database, Schema, Table, HasPK
      format = 'A';
    } else if (numCols >= 4) {
      // Check if col1 (2nd column) is a schema name → Format B (Database, Schema, Table, HasPK)
      // Check if col2 (3rd column) is a schema name → Format A without server? No, that's Format B
      if (COMMON_SCHEMAS.includes(col1)) {
        format = 'B';
      } else if (COMMON_SCHEMAS.includes(col0)) {
        format = 'C'; // Old format: Schema, Table, RowCount, HasPK
      } else {
        // Check headers
        if (col0 === 'servername' || col0 === 'server') {
          format = 'A';
        } else if (col0 === 'databasename' || col0 === 'database') {
          format = 'B';
        } else {
          // Default to B if last column is Yes/No
          const lastCol = cleanString(records[0][numCols - 1]).toLowerCase();
          format = (lastCol === 'yes' || lastCol === 'no') ? 'B' : 'C';
        }
      }
    }
  }

  const formatDesc = format === 'A' ? 'Server,Database,Schema,Table,HasPK' :
                     format === 'B' ? 'Database,Schema,Table,HasPK' :
                     'Schema,Table,RowCount,HasPK (old)';
  console.log(`Detected table CSV format: ${formatDesc}`);
  if (records.length > 0) {
    console.log(`First row: ${records[0].slice(0, 5).map((c: string) => cleanString(c)).join(' | ')}`);
  }

  for (const line of records) {
    if (line.length < 2) continue;

    let server: string | null = null;
    let databaseName: string;
    let schema: string;
    let tableName: string;
    let hasPk: boolean | null;

    if (format === 'A' && line.length >= 5) {
      // Format A: ServerName, DatabaseName, SchemaName, TableName, HasPK
      server = cleanString(line[0]) || null;
      databaseName = cleanString(line[1]);
      schema = cleanString(line[2]);
      tableName = cleanString(line[3]);
      hasPk = parseBoolean(line[4]);

      // Skip header
      if (server?.toLowerCase() === 'servername' || server?.toLowerCase() === 'server') continue;

    } else if (format === 'B' && line.length >= 4) {
      // Format B: DatabaseName, SchemaName, TableName, HasPK
      databaseName = cleanString(line[0]);
      schema = cleanString(line[1]);
      tableName = cleanString(line[2]);
      hasPk = parseBoolean(line[3]);

      // Skip header
      if (databaseName.toLowerCase() === 'databasename' || databaseName.toLowerCase() === 'database') continue;

    } else {
      // Format C (old): SchemaName, TableName, RowCount, HasPK
      schema = cleanString(line[0]);
      tableName = cleanString(line[1]);
      databaseName = 'SysproReporting';
      hasPk = parseBoolean(line.length > 3 ? line[3] : null);

      // Skip header
      if (schema.toLowerCase() === 'schema' || schema.toLowerCase() === 'schemaname') continue;
    }

    // Only include SysproReporting tables for lineage lookup
    if (databaseName.toLowerCase() === 'sysproreporting') {
      tables.push({
        id: null,
        server: server,
        databaseName: databaseName,
        schemaName: schema,
        tableName: tableName,
        hasPk: hasPk,
        sourceType: 'LOCAL',
      });
    }
  }

  console.log(`Loaded ${tables.length} SysproReporting tables from ${csvFilePath} (filtered from all databases)`);
  return tables;
}

export function loadSharedDatasets(csvFilePath: string): SharedDataset[] {
  const datasets: SharedDataset[] = [];
  const content = fs.readFileSync(csvFilePath, 'utf-8');
  const records = parse(content, { relax_column_count: true });

  let isFirstRow = true;
  for (const line of records) {
    // Skip header row
    if (isFirstRow) {
      isFirstRow = false;
      if (line.length > 0 && (line[0].toLowerCase().includes('dataset'))) {
        continue;
      }
    }

    if (line.length >= 1) {
      const datasetName = cleanString(line[0]);
      if (!datasetName) continue;

      datasets.push({
        id: null,
        datasetName: datasetName,
        datasetPath: line.length > 1 ? cleanString(line[1]) : null,
        commandType: line.length > 2 ? cleanString(line[2]) : null,
        commandText: line.length > 3 ? line[3] : null, // Don't trim SQL
      });
    }
  }

  console.log(`Loaded ${datasets.length} shared datasets from ${csvFilePath}`);
  return datasets;
}

export function loadLinkedServers(csvFilePath: string): LinkedServer[] {
  const servers: LinkedServer[] = [];
  const content = fs.readFileSync(csvFilePath, 'utf-8');
  const records = parse(content, { relax_column_count: true });

  for (const line of records) {
    if (line.length >= 2) {
      const alias = cleanString(line[0]);

      // Skip header row if present
      if (alias.toLowerCase() === 'alias' || alias.toLowerCase() === 'linked_server') {
        continue;
      }

      if (!alias) continue;

      servers.push({
        id: null,
        alias: alias,
        actualServer: cleanString(line[1]),
        provider: line.length > 2 ? cleanString(line[2]) : null,
      });
    }
  }

  console.log(`Loaded ${servers.length} linked servers from ${csvFilePath}`);
  return servers;
}

export function loadDependencies(csvFilePath: string): ProcDependency[] {
  const dependencies: ProcDependency[] = [];
  const content = fs.readFileSync(csvFilePath, 'utf-8');
  const records = parse(content, { relax_column_count: true });

  for (const line of records) {
    if (line.length >= 3) {
      const objectSchema = cleanString(line[0]);
      const objectName = cleanString(line[1]);

      // Skip header row if present
      if (objectSchema.toLowerCase() === 'objectschema' ||
          objectSchema.toLowerCase() === 'object_schema' ||
          objectName.toLowerCase() === 'objectname') {
        continue;
      }

      if (!objectSchema || !objectName) continue;

      // Get depends_on fields (may be NULL in CSV)
      let dependsOnSchema = line.length > 3 ? cleanString(line[3]) : null;
      let dependsOnName = line.length > 4 ? cleanString(line[4]) : null;
      let dependsOnType = line.length > 5 ? cleanString(line[5]) : null;

      // Convert "NULL" string to actual null
      if (dependsOnSchema?.toUpperCase() === 'NULL') dependsOnSchema = null;
      if (dependsOnName?.toUpperCase() === 'NULL') dependsOnName = null;
      if (dependsOnType?.toUpperCase() === 'NULL') dependsOnType = null;

      // Skip rows with no resolved dependency
      if (!dependsOnName) continue;

      dependencies.push({
        id: null,
        objectSchema: objectSchema,
        objectName: objectName,
        objectType: cleanString(line[2]),
        dependsOnSchema: dependsOnSchema,
        dependsOnName: dependsOnName,
        dependsOnType: dependsOnType,
      });
    }
  }

  console.log(`Loaded ${dependencies.length} dependencies from ${csvFilePath}`);
  return dependencies;
}

// RDL Report from CSV (exported from ReportServer)
export interface RdlReportCsv {
  reportName: string;
  reportPath: string;
  creationDate: string | null;
  modifiedDate: string | null;
  rdlContent: string;
}

export function loadRdlReports(filePath: string): RdlReportCsv[] {
  const reports: RdlReportCsv[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');

  // Detect delimiter: tab, pipe, or comma (in order of preference)
  const firstLine = content.split('\n')[0] || '';
  let delimiter = ',';
  let delimiterName = 'COMMA';

  if (firstLine.includes('\t')) {
    delimiter = '\t';
    delimiterName = 'TAB';
  } else if (firstLine.includes('|')) {
    delimiter = '|';
    delimiterName = 'PIPE';
  }

  console.log(`RDL reports file using delimiter: ${delimiterName}`);

  // BCP exports multi-line content without quotes - need to join lines
  // A new record starts with: Name|/Path|YYYY-MM-DD (date pattern)
  const recordStartPattern = /^[^|]+\|\/[^|]+\|\d{4}-\d{2}-\d{2}/;
  const lines = content.split('\n');
  const joinedRecords: string[] = [];
  let currentRecord = '';

  for (const line of lines) {
    if (recordStartPattern.test(line)) {
      // This is a new record - save the previous one
      if (currentRecord) {
        joinedRecords.push(currentRecord);
      }
      currentRecord = line;
    } else {
      // This is a continuation of the previous record
      currentRecord += '\n' + line;
    }
  }
  // Don't forget the last record
  if (currentRecord) {
    joinedRecords.push(currentRecord);
  }

  console.log(`Joined ${lines.length} lines into ${joinedRecords.length} records`);

  let validCount = 0;
  let invalidCount = 0;

  for (const record of joinedRecords) {
    // Split by delimiter (only first 4 delimiters - rest is XML content)
    const parts = record.split(delimiter);
    if (parts.length >= 5) {
      const reportName = cleanString(parts[0]);

      // Skip header row
      if (reportName.toLowerCase() === 'reportname' || reportName.toLowerCase() === 'name') {
        continue;
      }

      if (!reportName) continue;

      // Join remaining parts as XML content (XML may contain delimiter)
      let rdlContent = parts.slice(4).join(delimiter);

      // Basic validation - XML should start with <?xml or <Report
      const trimmedContent = (rdlContent || '').trim();
      if (!trimmedContent.startsWith('<?xml') && !trimmedContent.startsWith('<Report')) {
        console.warn(`Invalid RDL content for ${reportName} - doesn't start with XML declaration`);
        invalidCount++;
        // Still add it, but mark the issue
      } else {
        validCount++;
      }

      reports.push({
        reportName: reportName,
        reportPath: cleanString(parts[1]),
        creationDate: cleanString(parts[2]) || null,
        modifiedDate: cleanString(parts[3]) || null,
        rdlContent: rdlContent || '',
      });
    }
  }

  console.log(`Loaded ${reports.length} RDL reports (${validCount} valid, ${invalidCount} invalid XML) from ${filePath}`);
  return reports;
}

// Report Execution History from SSRS ExecutionLog
export function loadReportExecutionHistory(csvFilePath: string): ReportExecutionHistory[] {
  const history: ReportExecutionHistory[] = [];
  const content = fs.readFileSync(csvFilePath, 'utf-8');
  const records = parse(content, { relax_column_count: true });

  for (const line of records) {
    if (line.length >= 2) {
      const reportName = cleanString(line[0]);
      const reportPath = cleanString(line[1]);

      // Skip header row
      if (reportName.toLowerCase() === 'reportname' || reportName.toLowerCase() === 'name') {
        continue;
      }

      if (!reportName || !reportPath) continue;

      history.push({
        id: null,
        reportName: reportName,
        reportPath: reportPath,
        executionCount: parseInteger(line[2]) || 0,
        lastExecutedAt: cleanString(line[3]) || null,
        firstExecutedAt: cleanString(line[4]) || null,
        daysSinceLastRun: parseInteger(line[5]),
        successCount: parseInteger(line[6]) || 0,
        errorCount: parseInteger(line[7]) || 0,
        interactiveCount: parseInteger(line[8]) || 0,
        subscriptionCount: parseInteger(line[9]) || 0,
      });
    }
  }

  console.log(`Loaded ${history.length} report execution history records from ${csvFilePath}`);
  return history;
}

// Report Executions with Parameters from SSRS ExecutionLog3
export function loadReportExecutions(csvFilePath: string): ReportExecution[] {
  const executions: ReportExecution[] = [];
  const content = fs.readFileSync(csvFilePath, 'utf-8');

  // Detect delimiter
  const firstLine = content.split('\n')[0] || '';
  let delimiter = ',';
  if (firstLine.includes('\t')) {
    delimiter = '\t';
  }

  const records = parse(content, {
    delimiter: delimiter,
    relax_column_count: true,
    relax_quotes: true,
  });

  for (const line of records) {
    if (line.length >= 2) {
      const reportPath = cleanString(line[0]);
      const executedAt = cleanString(line[1]);

      // Skip header row
      if (reportPath.toLowerCase() === 'reportpath' || reportPath.toLowerCase() === 'path') {
        continue;
      }

      if (!reportPath || !executedAt) continue;

      executions.push({
        id: null,
        reportPath: reportPath,
        executedAt: executedAt,
        status: line.length > 2 ? cleanString(line[2]) : null,
        requestType: line.length > 3 ? cleanString(line[3]) : null,
        userName: line.length > 4 ? cleanString(line[4]) : null,
        parameters: line.length > 5 ? cleanString(line[5]) : null,
      });
    }
  }

  console.log(`Loaded ${executions.length} report executions from ${csvFilePath}`);
  return executions;
}

// Shared Data Sources from SSRS ReportServer (actual connection info)
export function loadSharedDataSources(csvFilePath: string): SharedDataSource[] {
  const dataSources: SharedDataSource[] = [];
  const content = fs.readFileSync(csvFilePath, 'utf-8');
  const records = parse(content, { relax_column_count: true });

  for (const line of records) {
    if (line.length >= 3) {
      const name = cleanString(line[0]);
      const path = cleanString(line[1]);
      const connectionString = cleanString(line[2]);

      // Skip header row
      if (name.toLowerCase() === 'datasourcename' || name.toLowerCase() === 'name') {
        continue;
      }

      if (!name) continue;

      // Parse connection string to extract server and database
      let server: string | null = null;
      let databaseName: string | null = null;

      if (connectionString) {
        const upper = connectionString.toUpperCase();

        // Extract server (Data Source=...)
        const serverIdx = upper.indexOf('DATA SOURCE=');
        if (serverIdx >= 0) {
          const start = serverIdx + 12;
          let end = connectionString.indexOf(';', start);
          if (end < 0) end = connectionString.length;
          server = connectionString.substring(start, end).trim();
        }

        // Extract database (Initial Catalog=...)
        const dbIdx = upper.indexOf('INITIAL CATALOG=');
        if (dbIdx >= 0) {
          const start = dbIdx + 16;
          let end = connectionString.indexOf(';', start);
          if (end < 0) end = connectionString.length;
          databaseName = connectionString.substring(start, end).trim();
        }
      }

      dataSources.push({
        id: null,
        dataSourceName: name,
        dataSourcePath: path || null,
        connectionString: connectionString || null,
        extension: line.length > 3 ? cleanString(line[3]) : null,
        server: server,
        databaseName: databaseName,
      });
    }
  }

  console.log(`Loaded ${dataSources.length} shared data sources from ${csvFilePath}`);
  return dataSources;
}

export interface LinkedReportCsv {
  linkedReportName: string;
  linkedReportPath: string;
  templatePath: string;
}

export function loadLinkedReports(csvFilePath: string): LinkedReportCsv[] {
  const linkedReports: LinkedReportCsv[] = [];
  const content = fs.readFileSync(csvFilePath, 'utf-8');
  const records = parse(content, { relax_column_count: true });

  // Detect format: 3 columns (new) or 6 columns (old)
  // Old format: LinkedReportName, LinkedReportPath, TemplateReportName, TemplateReportPath, CreatedDate, ModifiedDate
  // New format: LinkedReportName, LinkedReportPath, TemplatePath
  const isOldFormat = records.length > 0 && records[0].length >= 4;

  for (const line of records) {
    if (line.length < 3) continue;

    const linkedReportName = cleanString(line[0]);
    const linkedReportPath = cleanString(line[1]);
    // Old format: templatePath is column 3 (index 3), New format: column 2 (index 2)
    const templatePath = isOldFormat ? cleanString(line[3]) : cleanString(line[2]);

    // Skip header row
    if (linkedReportName.toLowerCase() === 'linkedreportname' ||
        linkedReportPath.toLowerCase() === 'linkedreportpath') {
      continue;
    }

    if (!linkedReportName || !linkedReportPath || !templatePath) {
      continue;
    }

    linkedReports.push({
      linkedReportName,
      linkedReportPath,
      templatePath,
    });
  }

  console.log(`Loaded ${linkedReports.length} linked reports from ${csvFilePath}`);
  return linkedReports;
}

// TRN1 Schema (new Syspro server objects) from CSV
export function loadTrn1Schema(csvFilePath: string): Trn1Schema[] {
  const schemas: Trn1Schema[] = [];
  const content = fs.readFileSync(csvFilePath, 'utf-8');
  const records = parse(content, { relax_column_count: true });

  for (const line of records) {
    if (line.length >= 4) {
      const server = cleanString(line[0]);
      const databaseName = cleanString(line[1]);
      const schemaName = cleanString(line[2]);
      const objectName = cleanString(line[3]);
      const objectType = line.length > 4 ? cleanString(line[4]) : null;

      // Skip header row
      if (server.toLowerCase() === 'servername' ||
          server.toLowerCase() === 'server' ||
          databaseName.toLowerCase() === 'databasename') {
        continue;
      }

      if (!schemaName || !objectName) continue;

      schemas.push({
        id: null,
        server: server || null,
        databaseName: databaseName || null,
        schemaName: schemaName,
        objectName: objectName,
        objectType: objectType,
      });
    }
  }

  console.log(`Loaded ${schemas.length} TRN1 schema objects from ${csvFilePath}`);
  return schemas;
}
