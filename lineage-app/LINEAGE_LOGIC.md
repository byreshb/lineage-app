# Lineage Tracking System - Complete Documentation

---

## ⚠️ Documentation Maintenance Rules

**IMPORTANT: When making ANY code changes, update BOTH:**

1. **This file (`LINEAGE_LOGIC.md`)** - The single source of truth for technical documentation
2. **How It Works page (`lineage-frontend/src/pages/HowItWorks.jsx`)** - User-facing documentation in the UI

### What to Update When:

| Change Type | Update LINEAGE_LOGIC.md | Update HowItWorks.jsx |
|-------------|-------------------------|----------------------|
| New CSV file added | ✅ Add to CSV Files section + SQL query | ✅ Add to CSV table + metadata tables |
| New database table | ✅ Add schema to relevant section | ✅ Add expandable table card |
| New API endpoint | ✅ Add to API Endpoints table | ❌ (not shown in UI) |
| New node type (lineage) | ✅ Add to Edge Types / Error Nodes | ✅ Add to Error Nodes section |
| New feature | ✅ Document the feature | ✅ Add to relevant section |
| Changed CSV columns | ✅ Update SQL query | ✅ Update table schema |
| Changed CSV purpose | ✅ Update description | ✅ Update purpose text |
| UI changes | ✅ Update Frontend Pages section | ✅ Update if affects docs |

### Files to Keep in Sync:
```
LINEAGE_LOGIC.md                           ← Technical docs (this file)
lineage-frontend/src/pages/HowItWorks.jsx  ← UI documentation page
lineage-frontend/src/pages/RdlManagement.jsx ← CSV details in metadata section
```

---

## Distribution & Packaging

### Folders to Exclude When Compressing

When distributing the project (zip, tar, etc.), **exclude these folders/files** to reduce size:

```
lineage-tracking-system/
├── lineage-frontend/
│   ├── dist/           ← EXCLUDE (regenerate with: npm run build)
│   └── node_modules/   ← EXCLUDE (regenerate with: npm install)
├── lineage-backend/
│   ├── target/         ← EXCLUDE (regenerate with: mvn compile)
│   └── lineage.db      ← EXCLUDE (created on first run)
```

### Setup Instructions for Recipients

After extracting:

```bash
# 1. Install frontend dependencies
cd lineage-frontend
npm install

# 2. Build frontend
npm run build

# 3. Run backend (from lineage-backend folder)
cd ../lineage-backend
mvn spring-boot:run

# 4. Access at http://localhost:8080
```

---

## Overview

The Lineage Tracking System analyzes SSRS Report Definition Language (RDL) files to trace data flow from **Reports** down to **Source Tables**. This is useful for understanding data dependencies before migrating to Snowflake.

> **Note:** This documentation is also available in the UI! Click **"How It Works"** in the navigation bar to see an interactive version with expandable sections and visual diagrams.

---

## Frontend Pages

| Page | URL | Description |
|------|-----|-------------|
| **RDL Management** | `/` | Load metadata, scan RDL files, run analysis |
| **View Lineage** | `/reports` | View analyzed reports and their lineage diagrams |
| **How It Works** | `/how-it-works` | Interactive documentation explaining the system |

### RDL Management Page Features
- **Load Metadata** button - loads all CSV files into the database
- **Metadata Details** (expandable) - shows each CSV file, its purpose, and the SQL query used to extract it
- **File List** - all RDL files found, with status and analyze buttons
- **Batch Analysis** - "Run All" to analyze all files at once

### View Lineage Page Features
- **Report List** - all analyzed reports with search and pagination
- **Lineage Diagram** - interactive flow diagram showing data lineage
- **Click nodes** to view SQL definitions (PROC, VIEW, SHARED_DATASET)
- **Export CSV** - download lineage for single report or all reports
- **Parsing Warnings** - shows missing metadata and dynamic SQL warnings

### How It Works Page Features
- **Overview Diagram** - visual flow from RDL → Table
- **Step-by-Step Process** - detailed explanation of each analysis step
- **Metadata Tables** - expandable cards showing all database tables with columns
- **Error Nodes** - explanation of red nodes and how to fix them
- **Example Trace** - visual walkthrough of a complete lineage path

---

## Source Environment

| Component | Detail |
|---|---|
| **Reporting Server** | D300SQLDW01 (SQL Server 2017, v14.0.1000.169) |
| **Reporting Database** | SysproReporting |
| **Linked Server** | SYSPRO → SUN300DSYSSQL01 (production Syspro ERP) |
| **SSRS Portal** | http://d300sqldw01/Reports/browse/Report |
| **Report Server DB** | ReportServer (on D300SQLDW01) |
| **Target Platform** | Snowflake |
| **Target BI Tool** | Power BI Cloud |

---

## Metadata CSV Files

All metadata is extracted from SQL Server and stored in CSV files in the `server-data/` folder.

### File Summary

| CSV File | Database Table | Purpose | Row Count |
|----------|----------------|---------|-----------|
| `ssrs_stored_procs.csv` | `stored_procedures` | Proc names and SQL definitions | ~500+ |
| `all_views.csv` | `views` | View names and SQL definitions | ~200+ |
| `tables_with_pks.csv` | `source_tables` | All tables in SysproReporting database (schema, name, row count, PK status) | ~300+ |
| `shared_datasets.csv` | `shared_datasets` | Shared dataset definitions from ReportServer | ~70+ |
| `linked_servers.csv` | `linked_servers` | Linked server alias mappings | ~5 |
| `dependencies.csv` | `proc_dependencies` | SQL Server's dependency tracking | ~5000+ |

---

## SQL Queries to Extract Metadata

All queries below are run against **D300SQLDW01** using SSMS with Windows Authentication. All queries are **read-only** metadata queries against system views.

### ssrs_stored_procs.csv

All stored procedures in the `ssrs` schema of SysproReporting. These are the procs called by SSRS reports.

```sql
USE [SysproReporting];
SELECT s.name AS SchemaName, o.name AS ProcName, m.definition AS ProcDefinition
FROM sys.sql_modules m
INNER JOIN sys.objects o ON m.object_id = o.object_id
INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
WHERE s.name = 'ssrs'
ORDER BY o.name;
```

### all_views.csv

All view definitions in SysproReporting.

```sql
USE [SysproReporting];
SELECT s.name AS SchemaName, o.name AS ViewName, m.definition AS ViewDefinition
FROM sys.sql_modules m
INNER JOIN sys.objects o ON m.object_id = o.object_id
INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
WHERE o.type_desc = 'VIEW'
ORDER BY s.name, o.name;
```

### tables_with_pks.csv

All user tables in SysproReporting with primary key status and approximate row counts.

```sql
USE [SysproReporting];
SELECT s.name AS SchemaName, t.name AS TableName, p.rows AS [RowCount],
    CASE WHEN kc.object_id IS NOT NULL THEN 'Yes' ELSE 'No' END AS HasPK
FROM sys.tables t
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0,1)
LEFT JOIN sys.key_constraints kc ON t.object_id = kc.parent_object_id AND kc.type = 'PK'
WHERE t.is_ms_shipped = 0
ORDER BY s.name, t.name;
```

### dependencies.csv

Object-level dependency mapping from SQL Server's internal tracking. Shows what each stored procedure/view references.

```sql
USE [SysproReporting];
SELECT s.name AS ObjectSchema, o.name AS ObjectName, o.type_desc AS ObjectType,
    dep_s.name AS DependsOnSchema, dep_o.name AS DependsOnName, dep_o.type_desc AS DependsOnType
FROM sys.sql_expression_dependencies d
INNER JOIN sys.objects o ON d.referencing_id = o.object_id
INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
LEFT JOIN sys.objects dep_o ON d.referenced_id = dep_o.object_id
LEFT JOIN sys.schemas dep_s ON dep_o.schema_id = dep_s.schema_id
ORDER BY s.name, o.name;
```

**Note:** NULL values in DependsOnSchema/DependsOnName indicate unresolved references (dynamic SQL, cross-database, linked servers).

### linked_servers.csv

Linked server configuration on D300SQLDW01.

```sql
SELECT name AS LinkedServerName, data_source AS ServerAddress, provider
FROM sys.servers
WHERE is_linked = 1;
```

### shared_datasets.csv

Shared dataset definitions from ReportServer. These are the actual SQL queries behind SharedDataSet references in RDL files.

```sql
USE [ReportServer];
SELECT
    c.Name AS dataset_name,
    c.Path AS dataset_path,
    x.value('(//rd:CommandType)[1]', 'nvarchar(50)') AS command_type,
    x.value('(//rd:CommandText)[1]', 'nvarchar(max)') AS command_text
FROM dbo.Catalog c
CROSS APPLY (
    SELECT CAST(CAST(c.Content AS varbinary(max)) AS xml) AS x
) AS parsed
CROSS APPLY parsed.x.nodes('/*') AS T(x)
WHERE c.Type = 8  -- Type 8 = SharedDataset
ORDER BY c.Path, c.Name;
```

**Type codes in ReportServer.dbo.Catalog:**
| Type | Description |
|------|-------------|
| 1 | Folder |
| 2 | Report |
| 3 | Resource |
| 4 | LinkedReport |
| 5 | DataSource |
| 6 | Model |
| 8 | SharedDataset |

---

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LINEAGE BUILDING FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

     RDL FILE
        │
        ▼
┌───────────────┐     Extracts:
│   RdlParser   │────────────────────►  • Report Name
│               │                       • DataSources (connection info)
│  (XML Parser) │                       • DataSets (queries)
└───────────────┘
        │
        ▼
┌───────────────┐     For each Dataset:
│LineageService │────────────────────►  • StoredProcedure → look up definition
│               │                       • Text (SQL) → parse directly
│  (Orchestrator)                       • SharedDataSet → look up in shared_datasets table
└───────────────┘
        │
        ▼
┌───────────────┐     Extracts from SQL:
│  SqlAnalyzer  │────────────────────►  • Table names (1-4 part names)
│               │                       • View references
│ (SQL Parser)  │                       • Linked server references
└───────────────┘
        │
        ▼
┌───────────────┐
│   LINEAGE     │     Graph of:
│    EDGES      │────────────────────►  REPORT → DATASET → PROC → VIEW → TABLE
│  (Database)   │
└───────────────┘
```

---

## Step 1: RDL File Parsing (`RdlParser.java`)

The RDL file is an XML document. The parser extracts three main things:

### 1.1 Report Name
```xml
<!-- Extracted from file name (most reliable) -->
"AP EFT Remittance Review.rdl" → "AP EFT Remittance Review"
```

### 1.2 DataSources
```xml
<DataSource Name="SysproReporting">
  <DataSourceReference>/Datasource/SysproReporting</DataSourceReference>
</DataSource>
```

**Types of DataSources:**
| Type | Description | How Detected |
|------|-------------|--------------|
| `SHARED` | References external `.rds` file | Has `<DataSourceReference>` tag |
| `EMBEDDED` | Connection string in RDL file | Has `<ConnectionString>` tag |

### 1.3 DataSets
```xml
<DataSet Name="ApPayRun">
  <Query>
    <CommandType>StoredProcedure</CommandType>
    <CommandText>dbo.spr_ApEftRemittance</CommandText>
  </Query>
</DataSet>
```

**Types of DataSets:**

| CommandType | Example | What It Contains |
|-------------|---------|------------------|
| `StoredProcedure` | `dbo.spr_ApEftRemittance` | Name of stored procedure to call |
| `Text` | `SELECT * FROM dbo.Company WHERE...` | Direct SQL query |
| `SharedDataSet` | `/DataSets/Companies` | Reference to shared dataset (.rsd file) |

---

## Step 2: Building Lineage (`LineageService.java`)

For each Dataset found, the service determines what tables it reads from.

### 2.1 Processing StoredProcedures

```
Dataset (CommandType=StoredProcedure)
    │
    │  CommandText = "dbo.spr_ApEftRemittance"
    │
    ▼
┌─────────────────────────────────┐
│  1. Extract proc name           │  SqlAnalyzer.extractStoredProcName()
│     "spr_ApEftRemittance"       │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  2. Look up in database         │  StoredProcRepository.findByName()
│     Find stored_procedures row  │
│     with matching proc_name     │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  3. Get proc definition (SQL)   │  proc.getDefinition()
│     CREATE PROC spr_... AS      │
│       SELECT * FROM dbo.Table1  │
│       JOIN LinkedSrv.DB.dbo.T2  │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  4. Parse SQL for table names   │  SqlAnalyzer.extractTables()
│     → dbo.Table1 (LOCAL)        │
│     → LinkedSrv.DB.dbo.T2       │
│       (LINKED_SERVER)           │
└─────────────────────────────────┘
```

### 2.2 Processing Direct SQL (Text)

```
Dataset (CommandType=Text)
    │
    │  CommandText = "SELECT * FROM dbo.Invoices WHERE..."
    │
    ▼
┌─────────────────────────────────┐
│  Parse SQL directly for tables  │  SqlAnalyzer.extractTables()
│  → dbo.Invoices (LOCAL)         │
└─────────────────────────────────┘
```

### 2.3 Processing SharedDataSets

```
Dataset (CommandType=SharedDataSet)
    │
    │  SharedDatasetPath = "/DataSets/Companies"
    │
    ▼
┌─────────────────────────────────┐
│  1. Look up in shared_datasets  │  SharedDatasetRepository.findByPath()
│     table (loaded from CSV)     │  or .findByName()
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  2. Get actual SQL from         │  sharedDataset.getCommandText()
│     command_text column         │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  3. Parse SQL for table names   │  SqlAnalyzer.extractTables()
│     (same as Text datasets)     │
└─────────────────────────────────┘
```

---

## Step 3: SQL Analysis (`SqlAnalyzer.java`)

The SQL analyzer extracts table references from SQL code using two approaches:

### 3.1 JSqlParser (Primary Method)

Uses the [JSqlParser](https://github.com/JSQLParser/JSqlParser) library to parse SQL statements:

```java
Statement stmt = CCJSqlParserUtil.parse(sql);
TablesNamesFinder finder = new TablesNamesFinder();
List<String> tables = finder.getTableList(stmt);
// Returns: ["dbo.Company", "dbo.Invoice", ...]
```

**Pros:** Accurate parsing of complex SQL
**Cons:** Fails on non-standard T-SQL syntax (OPENQUERY, 4-part names, etc.)

### 3.2 Regex Fallback (For Linked Servers)

JSqlParser doesn't handle 4-part names well. Regex catches these:

```
Pattern: SERVER.DATABASE.SCHEMA.TABLE

Example matches:
  SYSPRO.SysproCustomizations.dbo.ApPayRunRevision
  SUN300DSYSSQL01.SysproCompanyA.dbo.SorMaster
```

**Regex Pattern:**
```java
Pattern FOUR_PART_PATTERN = Pattern.compile(
    "\\b([A-Za-z][\\w]*)\\s*\\.\\s*([A-Za-z][\\w]*)\\s*\\.\\s*" +
    "([A-Za-z][\\w]*)\\s*\\.\\s*([A-Za-z][\\w]*)\\b"
);
```

### 3.3 Table Reference Types

| Parts | Format | Example | Source Type |
|-------|--------|---------|-------------|
| 4 | `server.database.schema.table` | `SYSPRO.SysproCustom.dbo.ApPay` | `LINKED_SERVER` |
| 3 | `database.schema.table` | `SysproCustom.dbo.ApPay` | `LOCAL` |
| 2 | `schema.table` | `dbo.ApPayRunRevision` | `LOCAL` |
| 1 | `table` | `ApPayRunRevision` | `LOCAL` (default schema=dbo) |

### 3.4 Linked Server Resolution

When a 4-part name is found (e.g., `SYSPRO.Database.dbo.Table`), the system:
1. Looks up the server alias in `linked_servers` table
2. If found, replaces alias with actual server name (e.g., `SYSPRO` → `SUN300DSYSSQL01`)
3. If not found, marks as `LINKED_SERVER_UNKNOWN` (error node)

### 3.5 SQL Cleaning

Before parsing, the SQL is cleaned:
- Remove `CREATE PROC ... AS` wrapper
- Remove `DECLARE @variable` statements
- Remove `SET @variable = ...` statements
- Remove comments (`/* */` and `--`)
- Remove `IF EXISTS(...) BEGIN...END` wrappers

---

## Step 4: Recursive View Analysis

When a view is found, its definition is also analyzed for tables:

```
PROC spr_GetInvoices
    │
    │  SELECT * FROM dbo.vwInvoiceDetails
    │
    ▼
VIEW vwInvoiceDetails                 ← Edge: PROC → VIEW
    │
    │  SELECT * FROM dbo.Invoice
    │  JOIN dbo.Customer
    │
    ▼
TABLE dbo.Invoice                     ← Edge: VIEW → TABLE
TABLE dbo.Customer                    ← Edge: VIEW → TABLE
```

This continues recursively if views reference other views.

---

## Step 5: Lineage Edges (Database)

Each relationship is stored as an edge:

```sql
CREATE TABLE lineage (
    report_id    INTEGER,     -- Which report this belongs to
    source_type  TEXT,        -- REPORT, DATASET, PROC, VIEW, TABLE, SHARED_DATASET
    source_id    INTEGER,     -- ID in source table
    source_name  TEXT,        -- Display name
    target_type  TEXT,        -- REPORT, DATASET, PROC, VIEW, TABLE, *_NOT_FOUND
    target_id    INTEGER,     -- ID in target table (-1 if not in metadata)
    target_name  TEXT,        -- Display name
    relationship TEXT         -- CONTAINS, CALLS, READS_FROM, USES
);
```

### Edge Types

| Source | Target | Relationship | Meaning |
|--------|--------|--------------|---------|
| REPORT | DATASET | CONTAINS | Report contains this dataset |
| DATASET | PROC | CALLS | Dataset calls this stored procedure |
| DATASET | SHARED_DATASET | USES | Dataset uses a shared dataset |
| DATASET | TABLE | READS_FROM | Dataset directly queries this table |
| SHARED_DATASET | TABLE | READS_FROM | Shared dataset queries this table |
| PROC | VIEW | READS_FROM | Procedure reads from this view |
| PROC | TABLE | READS_FROM | Procedure reads from this table |
| VIEW | TABLE | READS_FROM | View reads from this table |
| VIEW | VIEW | READS_FROM | View reads from another view |

### Error Node Types (Missing Metadata)

| Node Type | Meaning | Display |
|-----------|---------|---------|
| `PROC_NOT_FOUND` | Stored procedure not in metadata | Red node |
| `SHARED_DATASET_NOT_FOUND` | Shared dataset not in metadata | Red node |
| `TABLE_NOT_FOUND` | Table not found in source_tables | Red node |
| `VIEW_NOT_FOUND` | View not found in views table | Red node |
| `LINKED_SERVER_UNKNOWN` | Server alias not in linked_servers | Red node |

---

## Example: Complete Lineage

For report `AP EFT Remittance Review.rdl`:

```
REPORT: "AP EFT Remittance Review"
    │
    │ CONTAINS
    ▼
DATASET: "ApPayRun" (CommandType=StoredProcedure)
    │
    │ CALLS
    ▼
PROC: "spr_ApEftRemittance" (from stored_procedures table)
    │
    ├── READS_FROM ──► VIEW: "vwApPayRunDetails"
    │                      │
    │                      ├── READS_FROM ──► TABLE: dbo.ApPayRunRevision (LOCAL)
    │                      │
    │                      └── READS_FROM ──► TABLE: dbo.ApPayRunAuditDtl (LOCAL)
    │
    └── READS_FROM ──► TABLE: SYSPRO.SysproCompanyA.dbo.ApSupplier (LINKED_SERVER)
```

### Resulting Edges:

| Source | Target | Relationship |
|--------|--------|--------------|
| REPORT: AP EFT Remittance Review | DATASET: ApPayRun | CONTAINS |
| DATASET: ApPayRun | PROC: spr_ApEftRemittance | CALLS |
| PROC: spr_ApEftRemittance | VIEW: vwApPayRunDetails | READS_FROM |
| VIEW: vwApPayRunDetails | TABLE: dbo.ApPayRunRevision | READS_FROM |
| VIEW: vwApPayRunDetails | TABLE: dbo.ApPayRunAuditDtl | READS_FROM |
| PROC: spr_ApEftRemittance | TABLE: SYSPRO...ApSupplier | READS_FROM |

---

## Dual-Source Dependency Tracking

The system uses TWO sources to find dependencies, providing higher accuracy:

### Source 1: SQL Server Dependencies (dependencies.csv)

From `sys.sql_expression_dependencies` - SQL Server's internal dependency tracking.

**CSV Format:**
| Column | Description |
|--------|-------------|
| ObjectSchema | Schema of the proc/view |
| ObjectName | Name of the proc/view |
| ObjectType | SQL_STORED_PROCEDURE, VIEW |
| DependsOnSchema | Referenced object's schema (NULL if unresolved) |
| DependsOnName | Referenced object's name (NULL if unresolved) |
| DependsOnType | USER_TABLE, VIEW, SQL_INLINE_TABLE_VALUED_FUNCTION |

**Strengths:** Authoritative for static references
**Weaknesses:** Cannot track dynamic SQL, linked servers (shows NULL)

### Source 2: Regex/JSqlParser

Parses SQL definitions directly to extract table references.

**Strengths:** Catches linked servers (4-part names), dynamic SQL patterns
**Weaknesses:** May miss complex SQL constructs

### Discovery Methods

Each lineage edge is tagged with how it was discovered:

| Method | Meaning | Edge Color | Confidence |
|--------|---------|------------|------------|
| `BOTH` | Found by SQL Server AND Regex | Green | High |
| `SQL_SERVER` | Found by SQL Server only | Blue | Medium (regex missed it) |
| `REGEX` | Found by Regex only | Gray | Medium (dynamic SQL or linked server) |

### Why Both?

```
SQL Server tracking:  [dbo.Table1, dbo.Table2]           ← Static refs
Regex parsing:        [dbo.Table1, SYSPRO.db.dbo.Table3] ← Includes linked server

Merged result:
  - dbo.Table1     [BOTH]       ← High confidence
  - dbo.Table2     [SQL_SERVER] ← Regex missed (complex SQL?)
  - SYSPRO...Table3 [REGEX]     ← Linked server (SQL Server can't track)
```

---

## Dynamic SQL Warnings

Some SQL patterns cannot be fully parsed:

| Pattern | Example | Warning |
|---------|---------|---------|
| `sp_executesql` | `EXEC sp_executesql @sql` | "dynamic SQL table references may be missing" |
| `EXEC(@variable)` | `EXEC(@dynamicQuery)` | "dynamic SQL table references may be missing" |
| `OPENQUERY` | `OPENQUERY(LINKEDSRV, 'SELECT...')` | "remote table references may not be captured" |
| `OPENROWSET` | `OPENROWSET(...)` | "external data source references may not be captured" |

These warnings are displayed in the UI to indicate incomplete lineage.

---

## API Endpoints

| Endpoint | Returns |
|----------|---------|
| `POST /api/metadata/load` | Load all CSV files into database |
| `GET /api/metadata/status` | Metadata counts and load timestamp |
| `GET /api/rdl/scan` | Scan folder for RDL files |
| `POST /api/rdl/{fileName}/analyze` | Analyze single RDL file |
| `POST /api/rdl/analyze-all` | Analyze all RDL files |
| `GET /api/reports` | List all analyzed reports |
| `GET /api/reports/{id}/lineage` | Full graph (nodes + edges) for visualization |
| `GET /api/reports/{id}/tables` | List of source tables with server/database info |
| `GET /api/reports/{id}/datasources` | List of data sources (connection info) |
| `GET /api/reports/procs/{id}?name=X` | Stored procedure details + SQL definition |
| `GET /api/reports/views/{id}?name=X` | View details + SQL definition |
| `GET /api/reports/shared-datasets/{id}?name=X` | Shared dataset details + SQL definition |
| `GET /api/reports/{id}/export` | Download lineage as CSV for single report |
| `GET /api/reports/export-all` | Download lineage as CSV for all reports |

### CSV Export Format

The exported CSV shows flattened lineage: **Report → Dataset → Stored Proc → View → Table**

| Column | Description |
|--------|-------------|
| Report | Name of the SSRS report |
| Dataset | Name of the dataset in the report |
| Dataset Type | StoredProcedure, Text, or SharedDataSet |
| Stored Procedure | Procedure name (if dataset calls a proc) |
| View | View name (if data comes through a view) |
| Table | Final source table name |
| Schema | Table schema |
| Database | Table database |
| Server | Table server (for linked servers) |
| Status | OK or NOT FOUND |

**Example CSV:**
```
Report,Dataset,Dataset Type,Stored Procedure,View,Table,Schema,Database,Server,Status
AP EFT Remittance,ApPayRun,StoredProcedure,spr_ApEftRemittance,vApPayRunDetails,ApPayRunRevision,dbo,SysproReporting,D300SQLDW01,OK
AP EFT Remittance,ApPayRun,StoredProcedure,spr_ApEftRemittance,,ApSupplier,dbo,SysproCompanyA,SYSPRO,OK
Weekly Sales,Companies,SharedDataSet,,,Company,dbo,SysproReporting,D300SQLDW01,OK
```

**Status Values:**
- `OK` - Table found in metadata (tables_with_pks.csv)
- `NOT FOUND` - Table not in metadata (may be on linked server or missing from CSV)

---

## Application Configuration

The app uses relative paths by default. Override with environment variables:

```yaml
# application.yml
app:
  rdl-folder: ${RDL_FOLDER:../reports}
  csv-folder: ${CSV_FOLDER:../server-data}
  database: ${DATABASE_PATH:./lineage.db}
  timezone: America/Vancouver
```

**Folder structure:**
```
lineage-tracking-system/
├── server-data/            ← CSV metadata files
│   ├── ssrs_stored_procs.csv
│   ├── all_views.csv
│   ├── tables_with_pks.csv
│   ├── shared_datasets.csv
│   ├── linked_servers.csv
│   └── dependencies.csv
├── reports/                ← RDL files
│   └── ssrs/               ← SSRS reports subfolder
├── lineage-backend/        ← Java Spring Boot app
│   ├── lineage.db          ← SQLite database (created automatically)
│   └── src/
└── lineage-frontend/       ← React app
    └── src/
```

**Override paths (Windows):**
```batch
set RDL_FOLDER=C:\path\to\reports
set CSV_FOLDER=C:\path\to\server-data
```

**Override paths (Mac/Linux):**
```bash
export RDL_FOLDER=/path/to/reports
export CSV_FOLDER=/path/to/server-data
```

---

## False Positive Filtering

The regex-based table extraction can sometimes extract garbage table names from SQL. These are filtered out:

### Filtered Patterns

| Pattern | Reason |
|---------|--------|
| Names < 4 characters | Too short, likely partial match (`DB`, `SYS`) |
| `SYSPR`, `SYSPRO` | Partial linked server alias |
| `DBO`, `DB` | Schema name mistaken as table |
| `MASTER`, `TEMPDB`, `MSDB`, `MODEL` | System databases |
| `INFORMATION_SCHEMA` | System schema |
| `SUN300`, `SUN300D`, `SUN300DSYSSQL01` | Server name fragments |
| `SYSPROCOMPANYC`, `SYSPROREPORTING` | Database name fragments |
| `REPORTSERVER`, `REPORTSERVERTEMPDB` | Reporting services DBs |
| `STRING_SPLIT`, `OPENJSON`, `OPENXML` | Built-in table-valued functions |
| `INSERTED`, `DELETED` | Trigger pseudo-tables |
| Names ending in `SQL` + digits | Server name pattern (e.g., `SQL01`) |
| Short all-caps names (≤8 chars) | Likely server/DB names unless ending in `_TBL`, `_TABLE`, etc. |

### Implementation

Filtering happens in two places:
1. **SqlAnalyzer.java** - `isFalsePositive()` method filters during extraction
2. **LineageService.java** - `isFalsePositiveTableName()` method filters before saving TABLE_NOT_FOUND edges

---

## Cycle Detection (View Recursion)

Views can reference other views, which can create cycles (View A → View B → View A). The system prevents infinite recursion:

```java
// Track visited views to prevent cycles
Set<String> visitedViews = new HashSet<>();

// When processing a view:
String viewKey = "VIEW:" + viewName;
if (visitedViews.contains(viewKey)) {
    log.debug("Skipping already visited view: {}", viewName);
    return;  // Break the cycle
}
visitedViews.add(viewKey);

// Safety limit
if (visitedViews.size() > 50) {
    log.warn("Max recursion depth reached. Stopping.");
    return;
}
```

---

## Warning Deduplication

Warnings are deduplicated to avoid showing the same issue multiple times:

- Same table referenced by multiple procs → shown once
- Same proc with dynamic SQL → shown once
- Uses a `Set<String>` to track `entityType:entityName:warning` combinations

---

## Summary

1. **RDL Parsing**: Extract DataSets (queries) from RDL XML
2. **Dataset Processing**: For each dataset, determine query type
3. **Proc/View/SharedDataset Lookup**: Find definitions in metadata database
4. **SQL Analysis**: Extract table names using JSqlParser + regex
5. **Linked Server Resolution**: Map aliases to actual server names
6. **Recursive Analysis**: Follow view → table references
7. **Edge Storage**: Save all relationships to `lineage` table
8. **Error Flagging**: Mark missing metadata as error nodes (red)
9. **Graph Generation**: Build node/edge graph for visualization

The result is a complete picture of data flow from report to source tables, including external linked server references that are critical for Snowflake migration planning.

---

## Troubleshooting: Understanding Warnings

### Warning Types and How to Fix

| Warning | Meaning | How to Fix |
|---------|---------|------------|
| **PROC_NOT_FOUND** | Stored procedure not in `ssrs_stored_procs.csv` | Re-export from SQL Server and reload metadata |
| **TABLE_NOT_FOUND** (4-part name) | Linked server table | Expected - table is on external server (e.g., SYSPRO) |
| **TABLE_NOT_FOUND** (2-part name) | Table missing from `tables_with_pks.csv` | Re-export from SQL Server and reload metadata |
| **SHARED_DATASET_NOT_FOUND** | Shared dataset missing from `shared_datasets.csv` | Re-export from ReportServer and reload metadata |
| **sp_executesql warning** | Dynamic SQL in proc | Review proc manually - some tables may be missed |
| **OPENQUERY warning** | Remote query to linked server | Tables inside OPENQUERY are not parsed |

### Example: Missing Proc

```
PROC: ssrsPstSelfAssessmentReview
  Stored procedure not found in metadata - cannot trace lineage
```

**Fix:** The proc `ssrsPstSelfAssessmentReview` needs to be added to `ssrs_stored_procs.csv`:
1. Run the SQL query for `ssrs_stored_procs.csv` (see above)
2. Make sure this proc is included (check schema filter)
3. Run `POST /api/metadata/load` to reload
4. Re-analyze the report

### Example: Linked Server Table (Expected)

```
TABLE: SYSPRO.SysproCustomizations.dbo.ApPayRunRevision
  Table not found in metadata - may be on linked server
```

**This is expected!** The table exists on the SYSPRO linked server (SUN300DSYSSQL01), not in SysproReporting. This warning tells you:
- The report reads from an external server
- This is important for migration planning (need to migrate or connect to SYSPRO)

### Example: Dynamic SQL

```
PROC: ApRemittanceAdvice_PaymentNumbers
  Contains sp_executesql - dynamic SQL table references may be missing
```

**Meaning:** The proc builds SQL dynamically at runtime. The system cannot determine all tables because the table names are constructed as strings. Review the proc definition manually to find additional tables.

---

## Quick Reference: Metadata Refresh

When metadata is stale or missing:

```bash
# 1. Re-export CSVs from SQL Server (run queries in SSMS)
# 2. Place CSVs in server-data/ folder
# 3. Reload metadata
curl -X POST http://localhost:8080/api/metadata/load

# 4. Check counts
curl http://localhost:8080/api/metadata/status

# 5. Re-analyze reports
curl -X POST http://localhost:8080/api/rdl/analyze-all
```

### Expected Metadata Counts

| Table | Expected Rows |
|-------|---------------|
| `stored_procedures` | 500+ |
| `views` | 200+ |
| `source_tables` | 300+ |
| `shared_datasets` | 70+ |
| `linked_servers` | 5+ |
| `proc_dependencies` | 5000+ |
