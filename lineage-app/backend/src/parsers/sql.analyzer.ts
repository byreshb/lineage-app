import NodeSqlParser from "node-sql-parser";
const { Parser } = NodeSqlParser;

export interface TableReference {
  server: string | null;
  database: string | null;
  schema: string | null;
  tableName: string;
  sourceType: "LOCAL" | "LINKED_SERVER" | "DYNAMIC" | "CROSS_DATABASE";
}

export interface ProcedureCall {
  schema: string | null;
  procName: string;
}

// Column reference interface for CFF feature
export interface ColumnReference {
  table: string | null; // Table name or alias
  column: string; // Column name
  operation: string; // select, where, join, etc.
}

// SQL keywords to ignore
const SQL_KEYWORDS = new Set([
  "SELECT",
  "FROM",
  "WHERE",
  "AND",
  "OR",
  "NOT",
  "IN",
  "EXISTS",
  "INNER",
  "LEFT",
  "RIGHT",
  "OUTER",
  "CROSS",
  "FULL",
  "GROUP",
  "ORDER",
  "BY",
  "HAVING",
  "UNION",
  "ALL",
  "DISTINCT",
  "TOP",
  "AS",
  "ON",
  "WITH",
  "INTO",
  "VALUES",
  "SET",
  "INSERT",
  "UPDATE",
  "DELETE",
  "MERGE",
  "WHEN",
  "THEN",
  "ELSE",
  "CASE",
  "END",
  "NULL",
  "IS",
  "LIKE",
  "BETWEEN",
  "JOIN",
  "BEGIN",
  "DECLARE",
  "IF",
  "WHILE",
  "RETURN",
  "NOLOCK",
  "OVER",
  "PARTITION",
  "ROW_NUMBER",
  "RANK",
  "DENSE_RANK",
  "NVARCHAR",
  "VARCHAR",
  "INT",
  "INTEGER",
  "DECIMAL",
  "FLOAT",
  "CHAR",
  "TEXT",
  "BIT",
  "DATE",
  "DATETIME",
  "TIMESTAMP",
  "TRUE",
  "FALSE",
  "CAST",
  "CONVERT",
  "COALESCE",
  "ISNULL",
  "MAX",
  "MIN",
  "SUM",
  "COUNT",
  "AVG",
  "LEN",
  "RTRIM",
  "LTRIM",
]);

// False positive table names
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
  // Common words that appear in comments and should never be table names
  "OPERATIONS",
  "RUNTIME",
]);

// Regex patterns
// Handles both regular names and bracketed names like [TableName+]
// NOTE: Using \w+ (one or more) instead of \w* to ensure full names are captured
const FOUR_PART_PATTERN =
  /(?:\[([^\]]+)\]|([A-Za-z]\w+))\s*\.\s*(?:\[([^\]]+)\]|([A-Za-z]\w+))\s*\.\s*(?:\[([^\]]+)\]|([A-Za-z]\w+))\s*\.\s*(?:\[([^\]]+)\]|([A-Za-z]\w+))/gi;

const TWO_PART_PATTERN =
  /(?:FROM|JOIN|INTO|UPDATE)\s+(?:\[([^\]]+)\]|([A-Za-z]\w+))\s*\.\s*(?:\[([^\]]+)\]|([A-Za-z]\w+))(?![.\w])/gi;

// Three-part: database.schema.table (e.g., [DunnRite].[Prod].[InvoiceDetail])
const THREE_PART_PATTERN =
  /(?:FROM|JOIN|INTO|UPDATE)\s+(?:\[([^\]]+)\]|([A-Za-z]\w+))\s*\.\s*(?:\[([^\]]+)\]|([A-Za-z]\w+))\s*\.\s*(?:\[([^\]]+)\]|([A-Za-z]\w+))(?![.\w])/gi;

// One-part pattern: (?!\w) ensures we're at word boundary before checking for dot
// This prevents backtracking truncation (e.g., SRUtil.db -> SRUti)
const ONE_PART_PATTERN =
  /(?:FROM|JOIN|INTO|UPDATE)\s+(?:\[([^\]]+)\]|([A-Za-z]\w+))(?!\w)(?!\s*\.)/gi;

const sqlParser = new Parser();

function isKeyword(word: string | null): boolean {
  if (!word) return true;
  return SQL_KEYWORDS.has(word.toUpperCase());
}

function isFalsePositive(tableName: string | null): boolean {
  if (!tableName) return true;

  const upper = tableName.toUpperCase();

  // Too short - likely a partial match
  if (tableName.length < 4) return true;

  if (FALSE_POSITIVES.has(upper)) return true;

  // Looks like a server name (ends with SQL followed by digits)
  if (/SQL\d+$/i.test(upper)) return true;

  // Short all-caps names are likely server/db names
  if (tableName.length <= 8 && tableName === tableName.toUpperCase()) {
    if (!/(TBL|TABLE|LOG|HIST|DATA|INFO|DETAIL|HDR|DTL)$/i.test(upper)) {
      return true;
    }
  }

  return false;
}

function isValidTableRef(ref: TableReference): boolean {
  if (!ref || !ref.tableName) return false;
  if (isKeyword(ref.tableName)) return false;
  if (isFalsePositive(ref.tableName)) return false;

  // Skip table-valued functions (names starting with 'fn')
  // These appear after JOIN just like tables but are function calls
  if (ref.tableName.toLowerCase().startsWith("fn")) return false;

  // Also check schema for false positives
  if (ref.schema && isFalsePositive(ref.schema)) {
    if (ref.tableName.length < 5) return false;
  }

  return true;
}

function cleanSql(sql: string): string {
  // Remove multi-line comments
  let cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, " ");

  // Remove single-line comments more carefully
  // If the SQL has newlines, remove -- comments to end of line
  // If no newlines, only remove -- comments that end at a SQL keyword boundary
  if (cleaned.includes("\n") || cleaned.includes("\r")) {
    // Has newlines - safe to remove to end of line
    cleaned = cleaned.replace(/--[^\r\n]*/g, " ");
  } else {
    // No newlines - only remove -- comments before major SQL keywords
    // This prevents removing the entire SQL when comments are inline
    cleaned = cleaned.replace(
      /--[^-]*?(?=\s+(SELECT|FROM|WHERE|JOIN|UNION|INSERT|UPDATE|DELETE|WITH|ORDER|GROUP|HAVING|INNER|LEFT|RIGHT|CROSS|FULL|EXEC|CREATE|ALTER|DROP)\s)/gi,
      " ",
    );
    // Also remove -- comments at the very end (after the last keyword)
    cleaned = cleaned.replace(/--[^-]*$/g, " ");
  }

  // Replace multiple whitespace with single space
  cleaned = cleaned.replace(/\s+/g, " ");
  return cleaned;
}

function prepareSqlForParsing(sql: string): string {
  // Remove CREATE PROC/VIEW header if present
  // Handles both bracketed ([schema].[name]) and unbracketed (schema.name) formats
  let cleaned = sql.replace(
    /CREATE\s+(PROCEDURE|PROC|VIEW)\s+(?:(?:\[[^\]]+\]|\w+)\.)*(?:\[[^\]]+\]|\w+)\s*/gi,
    "",
  );

  // Remove parameter declarations
  cleaned = cleaned.replace(/@\w+\s+[A-Za-z]+[^,@]*[,]?/gi, " ");

  // Remove AS BEGIN...END wrapper
  cleaned = cleaned.replace(/\bAS\s+BEGIN\b/gi, "");
  cleaned = cleaned.replace(/\bEND\s*$/gi, "");

  // Remove DECLARE statements
  cleaned = cleaned.replace(/DECLARE\s+@[^;]+;?/gi, " ");

  // Remove SET statements
  cleaned = cleaned.replace(/SET\s+@?\w+\s*=\s*[^;]+;?/gi, " ");
  cleaned = cleaned.replace(/SET\s+NOCOUNT\s+ON\s*;?/gi, " ");

  // Remove IF statements but keep content
  cleaned = cleaned.replace(/IF\s+EXISTS\s*\([^)]+\)\s*BEGIN/gi, "");
  cleaned = cleaned.replace(/IF\s+[^\s]+/gi, "");
  cleaned = cleaned.replace(/\bBEGIN\b/gi, "");
  cleaned = cleaned.replace(/\bEND\b/gi, "");

  // Remove EXEC sp_executesql calls
  cleaned = cleaned.replace(/EXEC\s+sp_executesql[^;]+;?/gi, "");

  return cleanSql(cleaned).trim();
}

// Patterns for dynamic SQL table references
// Matches: @Server + '.' + @DatabaseName + '.dbo.TableName'
// Matches: ' + @Variable + N'.schema.TableName
// Matches: '.dbo.[TableName+]' (bracketed names with special chars)
const DYNAMIC_TABLE_PATTERNS = [
  // Pattern: @Var + '.dbo.TableName' or @Var + N'.dbo.TableName'
  /@\w+\s*\+\s*N?['"]\s*\.\s*(\w+)\s*\.\s*(\w+)/gi,
  // Pattern: '.dbo.[BracketedTable+]' with special characters in brackets
  /N?['"]\.(\w+)\.\[([^\]]+)\](?:\s+(?:AS\s+)?\w+)?/gi,
  // Pattern: '.dbo.TableName AS' inside dynamic SQL strings
  /N?['"]\.(\w+)\.(\w+)(?:\s+(?:AS\s+)?\w+)?(?:\s+WITH\s*\([^)]+\))?/gi,
  // Pattern: + N'.SysproCompany*.dbo.TableName (with variable database)
  /@\w+\s*\+\s*N?['"][^'"]*\.(\w+)\.(\w+)/gi,
  // Pattern: + N'...dbo.[BracketedTable+]' with special characters
  /@\w+\s*\+\s*N?['"][^'"]*\.(\w+)\.\[([^\]]+)\]/gi,
];

function extractDynamicTables(sql: string): TableReference[] {
  const tables: TableReference[] = [];
  const foundTables = new Set<string>();

  for (const pattern of DYNAMIC_TABLE_PATTERNS) {
    const regex = new RegExp(pattern.source, "gi");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(sql)) !== null) {
      const schema = match[1];
      const tableName = match[2];

      // Skip if already found or invalid
      if (!tableName || foundTables.has(tableName.toLowerCase())) continue;
      if (isKeyword(tableName) || isKeyword(schema)) continue;
      if (isFalsePositive(tableName)) continue;

      // Skip common non-table matches
      if (
        ["dbo", "sys", "syspro", "stage", "bi", "xref"].includes(
          schema.toLowerCase(),
        ) === false
      ) {
        // Schema doesn't look like a real schema, might be part of db name
        continue;
      }

      const ref: TableReference = {
        server: "@DYNAMIC",
        database: "@DYNAMIC",
        schema,
        tableName,
        sourceType: "DYNAMIC",
      };

      tables.push(ref);
      foundTables.add(tableName.toLowerCase());
    }
  }

  return tables;
}

function extractFourPartTables(sql: string): TableReference[] {
  const tables: TableReference[] = [];
  const cleanedSql = cleanSql(sql);

  let match: RegExpExecArray | null;
  const pattern = new RegExp(FOUR_PART_PATTERN.source, "gi");

  while ((match = pattern.exec(cleanedSql)) !== null) {
    // New pattern has 8 groups: odd groups (1,3,5,7) = bracketed, even groups (2,4,6,8) = regular
    const server = match[1] || match[2];
    const database = match[3] || match[4];
    const schema = match[5] || match[6];
    const table = match[7] || match[8];

    if (
      isKeyword(server) ||
      isKeyword(database) ||
      isKeyword(schema) ||
      isKeyword(table)
    ) {
      continue;
    }

    const ref: TableReference = {
      server,
      database,
      schema,
      tableName: table,
      sourceType: "LINKED_SERVER",
    };

    if (isValidTableRef(ref)) {
      tables.push(ref);
    }
  }

  return tables;
}

function extractTablesWithParser(sql: string): TableReference[] {
  const tables: TableReference[] = [];

  try {
    const cleanedSql = prepareSqlForParsing(sql);

    // Try parsing with transactsql dialect
    const ast = sqlParser.astify(cleanedSql, { database: "transactsql" });
    const tableList = sqlParser.tableList(cleanedSql, {
      database: "transactsql",
    });

    for (const tableFqn of tableList) {
      // Format is usually "select::schema::table" or "select::null::table"
      const parts = tableFqn.split("::");
      if (parts.length >= 3) {
        const schemaOrNull = parts[1];
        const table = parts[2].replace(/[[\]]/g, "");

        const ref: TableReference = {
          server: null,
          database: null,
          schema: schemaOrNull === "null" ? "" : schemaOrNull,
          tableName: table,
          sourceType: "LOCAL",
        };

        if (isValidTableRef(ref)) {
          tables.push(ref);
        }
      }
    }
  } catch (e) {
    // Parser failed, will fall back to regex
    console.debug(`SQL parser failed: ${(e as Error).message}`);
  }

  return tables;
}

function extractTablesWithRegex(sql: string): TableReference[] {
  const tables: TableReference[] = [];

  // Minimal cleaning: only remove multi-line comments
  // Don't try to remove single-line comments as it's causing issues
  let processedSql = sql;

  // Remove multi-line comments
  processedSql = processedSql.replace(/\/\*[\s\S]*?\*\//g, " ");

  // Normalize whitespace (but don't collapse newlines if they exist)
  const cleanedSql = processedSql.replace(/[ \t]+/g, " ").trim();

  const foundTables = new Set<string>();

  // Three-part names first (database.schema.table) - must check before two-part
  let match: RegExpExecArray | null;
  const threePartPattern = new RegExp(THREE_PART_PATTERN.source, "gi");

  while ((match = threePartPattern.exec(cleanedSql)) !== null) {
    const database = match[1] || match[2];
    const schema = match[3] || match[4];
    const table = match[5] || match[6];

    if (!database || !schema || !table) continue;

    const ref: TableReference = {
      server: null,
      database,
      schema,
      tableName: table,
      sourceType: "CROSS_DATABASE",
    };

    if (isValidTableRef(ref)) {
      tables.push(ref);
      // Store as database.schema.table to avoid duplicates
      foundTables.add(`${database}.${schema}.${table}`.toLowerCase());
    }
  }

  // Two-part names (schema.table)
  const twoPartPattern = new RegExp(TWO_PART_PATTERN.source, "gi");

  while ((match = twoPartPattern.exec(cleanedSql)) !== null) {
    const schema = match[1] || match[2];
    const table = match[3] || match[4];

    if (!schema || !table) continue;

    // Skip if already found as 3-part
    const key = `${schema}.${table}`.toLowerCase();
    if ([...foundTables].some((f) => f.endsWith(key))) continue;

    const ref: TableReference = {
      server: null,
      database: null,
      schema,
      tableName: table,
      sourceType: "LOCAL",
    };

    if (isValidTableRef(ref)) {
      tables.push(ref);
      foundTables.add(key);
    }
  }

  // One-part names (just table name)
  const onePartPattern = new RegExp(ONE_PART_PATTERN.source, "gi");

  while ((match = onePartPattern.exec(cleanedSql)) !== null) {
    const table = match[1] || match[2];

    if (!table) continue;
    if (foundTables.has(table.toLowerCase())) continue;

    const ref: TableReference = {
      server: null,
      database: null,
      schema: "", // Leave blank - schema not specified in SQL
      tableName: table,
      sourceType: "LOCAL",
    };

    if (isValidTableRef(ref)) {
      tables.push(ref);
      foundTables.add(table.toLowerCase());
    }
  }

  return tables;
}

export function extractTables(sql: string | null): TableReference[] {
  if (!sql) return [];

  const tableMap = new Map<string, TableReference>();

  // First, extract 4-part names (linked server references)
  for (const ref of extractFourPartTables(sql)) {
    const key = getTableKey(ref);
    tableMap.set(key, ref);
  }

  // Extract dynamic SQL table references
  for (const ref of extractDynamicTables(sql)) {
    // For dynamic tables, use just schema.tableName as key to avoid duplicates
    const key = `dynamic.${ref.schema}.${ref.tableName}`.toLowerCase();
    if (!tableMap.has(key)) {
      tableMap.set(key, ref);
    }
  }

  // Track table names already found with full 4-part or dynamic refs
  // to avoid duplicates when parser/regex finds partial matches
  const foundTableNames = new Set<string>();
  for (const ref of tableMap.values()) {
    foundTableNames.add(ref.tableName.toLowerCase());
  }

  // Try SQL parser first
  const parserResults = extractTablesWithParser(sql);
  for (const ref of parserResults) {
    const key = getTableKey(ref);
    // Skip if already found as 4-part/dynamic OR if table name already exists
    if (
      !tableMap.has(key) &&
      !foundTableNames.has(ref.tableName.toLowerCase())
    ) {
      tableMap.set(key, ref);
      foundTableNames.add(ref.tableName.toLowerCase());
    }
  }

  // Always also run regex to catch references the parser missed
  // (e.g., bracket syntax [schema].[table] that the parser doesn't handle)
  // Always also run regex to catch references the parser missed
  // (e.g., bracket syntax [schema].[table] that the parser doesn't handle)
  for (const ref of extractTablesWithRegex(sql)) {
    const key = getTableKey(ref);
    // Skip if already found
    if (
      !tableMap.has(key) &&
      !foundTableNames.has(ref.tableName.toLowerCase())
    ) {
      tableMap.set(key, ref);
      foundTableNames.add(ref.tableName.toLowerCase());
    }
  }

  return Array.from(tableMap.values());
}

function getTableKey(ref: TableReference): string {
  return `${ref.server || ""}.${ref.database || ""}.${ref.schema || ""}.${ref.tableName}`.toLowerCase();
}

export function extractStoredProcName(
  commandText: string | null,
): string | null {
  if (!commandText) return null;

  const cleaned = commandText.trim();

  // If it's just a procedure name without EXEC
  if (!cleaned.toUpperCase().includes("EXEC")) {
    const parts = cleaned.split(/\s+/);
    if (parts.length >= 1) {
      const potentialProc = parts[0];
      // Remove schema prefix if present
      if (potentialProc.includes(".")) {
        const procParts = potentialProc.split(".");
        return procParts[procParts.length - 1].replace(/[[\]]/g, "");
      }
      return potentialProc.replace(/[[\]]/g, "");
    }
  }

  // Look for EXEC pattern
  const execPattern = /(?:EXEC(?:UTE)?\s+)(?:\[?([\w]+)\]?\.)?(\[?[\w]+\]?)/i;
  const match = execPattern.exec(cleaned);
  if (match) {
    const procName = match[2];
    return procName ? procName.replace(/[[\]]/g, "") : null;
  }

  return null;
}

export function detectDynamicSqlWarnings(sql: string | null): string[] {
  if (!sql) return [];

  const warnings: string[] = [];
  const upperSql = sql.toUpperCase();

  if (upperSql.includes("SP_EXECUTESQL")) {
    warnings.push(
      "Contains sp_executesql - dynamic SQL table references may be missing",
    );
  }

  if (/EXEC(UTE)?\s*\(\s*@\w+/i.test(sql)) {
    warnings.push(
      "Contains EXEC(@variable) - dynamic SQL table references may be missing",
    );
  }

  if (/@\w+\s*\+\s*'\.'\s*\+\s*@\w+/i.test(sql)) {
    warnings.push(
      "Contains dynamic table name construction - table references may be missing",
    );
  }

  if (upperSql.includes("OPENQUERY")) {
    warnings.push(
      "Contains OPENQUERY - remote table references may not be captured",
    );
  }

  if (upperSql.includes("OPENROWSET")) {
    warnings.push(
      "Contains OPENROWSET - external data source references may not be captured",
    );
  }

  return warnings;
}

// System stored procedures to skip when extracting procedure calls
const SYSTEM_PROCS = new Set([
  "SP_EXECUTESQL",
  "SP_EXECUTE",
  "SP_PREPEXEC",
  "SP_CURSOREXECUTE",
  "SP_CURSOR",
  "SP_CURSOROPEN",
  "SP_CURSORCLOSE",
  "SP_CURSORFETCH",
  "SP_CURSOROPTION",
  "SP_CURSORPREPARE",
  "SP_CURSORUNPREPARE",
  "SP_DESCRIBE_CURSOR",
  "SP_DESCRIBE_CURSOR_COLUMNS",
  "SP_DESCRIBE_CURSOR_TABLES",
  "SP_REFRESHSQLMODULE",
  "SP_REFRESHVIEW",
  "SP_ADDMESSAGE",
  "SP_DROPMESSAGE",
  "SP_SEND_DBMAIL",
  "SP_START_JOB",
  "SP_STOP_JOB",
  "SP_HELP",
  "SP_HELPTEXT",
  "SP_HELPINDEX",
  "SP_HELPCONSTRAINT",
  "SP_DEPENDS",
  "SP_TABLES",
  "SP_COLUMNS",
  "SP_STORED_PROCEDURES",
  "SP_RENAME",
  "SP_RENAMEDB",
  "SP_RECOMPILE",
  "SP_GETAPPLOCK",
  "SP_RELEASEAPPLOCK",
  "SP_XML_PREPAREDOCUMENT",
  "SP_XML_REMOVEDOCUMENT",
  "XP_CMDSHELL",
  "XP_FILEEXIST",
  "XP_LOGEVENT",
  "XP_SENDMAIL",
  "RAISERROR",
  "THROW",
  "PRINT",
]);

// Pattern to match EXEC/EXECUTE procedure calls
// Matches: EXEC procName, EXEC schema.procName, EXEC [schema].[procName], EXECUTE dbo.procName @param=value
const EXEC_PROC_PATTERN =
  /(?:EXEC(?:UTE)?)\s+(?:(?:\[?(\w+)\]?)\s*\.\s*)?(?:\[?(\w+)\]?)(?:\s|;|$|@)/gi;

export function extractProcedureCalls(sql: string | null): ProcedureCall[] {
  if (!sql) return [];

  const procs: ProcedureCall[] = [];
  const foundProcs = new Set<string>();
  const cleanedSql = cleanSql(sql);

  const pattern = new RegExp(EXEC_PROC_PATTERN.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(cleanedSql)) !== null) {
    const schema = match[1] || null;
    const procName = match[2];

    if (!procName) continue;

    // Skip system procedures
    if (SYSTEM_PROCS.has(procName.toUpperCase())) continue;

    // Skip if already found
    const key = `${schema || "dbo"}.${procName}`.toLowerCase();
    if (foundProcs.has(key)) continue;

    // Skip if it looks like a variable (starts with @)
    if (procName.startsWith("@")) continue;

    // Skip very short names (likely false positives)
    if (procName.length < 3) continue;

    procs.push({ schema, procName });
    foundProcs.add(key);
  }

  return procs;
}

/**
 * Extract column references from SQL using node-sql-parser's columnList() method
 * Returns columns with their table references and operation types
 */
export function extractColumns(sql: string | null): ColumnReference[] {
  if (!sql) return [];

  const columns: ColumnReference[] = [];
  const seen = new Set<string>();

  try {
    const cleanedSql = prepareSqlForParsing(sql);

    // Use columnList() to extract column references
    // Returns format: "operation::table::column" (e.g., "select::t::CustomField")
    const columnList = sqlParser.columnList(cleanedSql, {
      database: "transactsql",
    });

    for (const columnEntry of columnList) {
      const parts = columnEntry.split("::");
      if (parts.length >= 3) {
        const operation = parts[0];
        const table =
          parts[1] === "null" ? null : parts[1].replace(/[[\]]/g, "");
        const column = parts[2].replace(/[[\]]/g, "");

        // Skip wildcard and non-meaningful columns
        if (column === "*" || column === "" || column === "null") continue;

        // Skip common non-column tokens
        if (
          ["CASE", "WHEN", "THEN", "ELSE", "END", "NULL", "AS"].includes(
            column.toUpperCase(),
          )
        )
          continue;

        const key = `${operation}:${table || ""}:${column}`.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          columns.push({ table, column, operation });
        }
      }
    }
  } catch (e) {
    // Parser failed - try regex fallback for basic column extraction
    console.debug(`SQL parser columnList failed: ${(e as Error).message}`);
    return extractColumnsWithRegex(sql);
  }

  // Also try regex fallback to catch T-SQL bracket syntax the parser might miss
  const regexColumns = extractColumnsWithRegex(sql);
  for (const col of regexColumns) {
    const key =
      `${col.operation}:${col.table || ""}:${col.column}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      columns.push(col);
    }
  }

  return columns;
}

/**
 * Regex fallback for column extraction - handles T-SQL bracket syntax
 */
function extractColumnsWithRegex(sql: string): ColumnReference[] {
  const columns: ColumnReference[] = [];
  const seen = new Set<string>();

  // Pattern for table.column or alias.column references
  // Handles: t.ColumnName, [alias].[Column+], table.[ColumnName]
  const patterns = [
    // [table].[column] or [alias].[column]
    /\[?(\w+)\]?\.\[([^\]]+)\]/gi,
    // alias.column (not followed by opening paren - those are function calls)
    /(\w+)\.(\w+)(?!\s*\()/gi,
  ];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, "gi");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(sql)) !== null) {
      const table = match[1];
      const column = match[2];

      // Skip if it looks like a database.schema or schema.table reference
      if (isKeyword(column) || isKeyword(table)) continue;

      // Skip function calls
      if (
        ["dbo", "syspro", "stage", "bi", "xref", "sys"].includes(
          table.toLowerCase(),
        )
      ) {
        // This is likely schema.object, not alias.column
        continue;
      }

      const key = `select:${table}:${column}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        columns.push({ table, column, operation: "select" });
      }
    }
  }

  return columns;
}
