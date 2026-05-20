# Lineage Tracking System

Report Lineage Tracking System - analyzes SSRS RDL files and Power BI data source mappings to trace data flow from reports through datasets to source tables, stored procedures, and views.

## Quick Start

```bash
# Install all dependencies
npm run install-all

# Start backend + frontend together
npm run start
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8080

## Project Structure

```
lineage-app/
├── backend/                 # Fastify + TypeScript API
│   ├── src/
│   │   ├── index.ts        # Entry point
│   │   ├── app.ts          # Fastify setup
│   │   ├── db/             # SQLite database
│   │   ├── config/         # Configuration
│   │   ├── parsers/        # RDL, SQL, CSV parsing
│   │   ├── repositories/   # Data access layer
│   │   ├── services/       # Business logic
│   │   ├── routes/         # API endpoints
│   │   └── types/          # TypeScript types
│   └── lineage.db          # SQLite database file
├── frontend/                # React + Vite UI
│   ├── src/
│   │   ├── pages/          # RdlManagement, LineageViewer, HowItWorks
│   │   ├── components/     # LineageGraph, NodeDetails, TableList, etc.
│   │   ├── api/            # Axios API client
│   │   └── styles/         # CSS
├── data/                    # CSV metadata files (input)
├── reports/                 # RDL files to analyze (input)
└── SQL/                     # SQL queries to generate CSV files
```

## How It Works

### Data Flow

1. **Load Metadata** - CSV files with SQL Server metadata are loaded into SQLite
   - `all_stored_procs.csv` - Stored procedure definitions from ALL databases on SQL2(D300SQLDW01)
   - `all_views.csv` - View definitions from ALL databases on SQL2(D300SQLDW01)
   - `tables_with_pks.csv` - Tables with server, database, schema, PK info from ALL databases
   - `shared_datasets.csv` - SSRS shared datasets (SQL queries)
   - `shared_datasources.csv` - SSRS shared data sources (connection strings with actual server/database)
   - `linked_servers.csv` - SQL Server linked servers
   - `all_dependencies.csv` - SQL Server dependency metadata from ALL databases
   - `rdl_reports.csv` - (Optional) RDL content exported from ReportServer
   - `report_execution_history.csv` - (Optional) Execution stats from SSRS ExecutionLog
   - `report_executions.csv` - (Optional) Recent executions with parameters from ExecutionLog3
   - `FP Reporting_DataSourcesMapping.xlsx` - (Optional) Power BI data source mappings
   - `new_syspro_schema.csv` - (Optional) Tables/views from new Syspro (TRN1) for "Available In New Syspro" column

2. **Analyze RDL Files** - Two sources available:
   - **Files**: Parse physical RDL files from `reports/` folder
   - **Database**: Parse RDL content from `rdl_reports.csv` (exported from ReportServer)

3. **Parse RDL** - Extract from each report:
   - Data sources (connection strings)
   - Datasets (queries, stored procs, shared datasets)
   - Build lineage edges between entities

4. **Build Lineage** - For each dataset:
   - If stored procedure: Find proc → analyze SQL → extract tables
   - If direct SQL: Analyze SQL → extract tables
   - If shared dataset: Find dataset → analyze its SQL
   - Track discovery method: REGEX, SQL_SERVER, BOTH, DYNAMIC

5. **Visualize** - D3 force-directed graph showing:
   - REPORT → DATASET → PROC/VIEW → TABLE relationships
   - Color-coded nodes by type
   - Click nodes to view SQL definitions

### Key Services

- **LineageService** (`/backend/src/services/lineage.service.ts`)
  - Core lineage building logic
  - SQL analysis to extract table references
  - Handles stored procs, views, shared datasets
  - Exports lineage to CSV

- **RdlService** (`/backend/src/services/rdl.service.ts`)
  - Scans RDL folder recursively
  - Parses RDL XML files
  - Batch analysis with progress tracking

- **MetadataService** (`/backend/src/services/metadata.service.ts`)
  - Loads CSV metadata files into database

- **PbiLineageService** (`/backend/src/services/pbi-lineage.service.ts`)
  - Loads Power BI data from Excel file
  - Builds lineage graph for PBI reports
  - Detects nested views recursively
  - Exports PBI lineage to CSV

- **CsvExportService** (`/backend/src/services/csv-export.service.ts`)
  - Unified CSV export with ReportType column
  - Supports SSRS only, Power BI only, or combined export

### API Endpoints

**Metadata** (`/api/metadata`)
- `POST /load` - Load CSV metadata
- `GET /status` - Check metadata status

**RDL** (`/api/rdl`)
- `GET /scan` - Scan RDL folder
- `POST /:fileName/analyze` - Analyze single file
- `POST /analyze-all` - Batch analysis
- `GET /processing-status` - Batch progress

**Reports** (`/api/reports`)
- `GET /` - List all reports
- `GET /:id/lineage` - Get lineage graph
- `GET /:id/tables` - Get source tables
- `GET /:id/export` - Export lineage CSV
- `GET /procs/:id` - Get stored proc definition
- `GET /views/:id` - Get view definition
- `GET /unified-export?scope=` - Unified CSV export (scope: ssrs, pbi, both)

**Power BI** (`/api/pbi`)
- `POST /load` - Load Excel file into database
- `GET /status` - Check if PBI data is loaded
- `GET /reports` - List all PBI reports
- `GET /reports/:id` - Get single PBI report
- `GET /reports/:id/lineage` - Get lineage graph for D3
- `POST /reports/:id/build-lineage` - Build lineage for a report
- `GET /reports/:id/tables` - Get source tables
- `GET /reports/:id/export` - Export single report CSV
- `GET /export-all` - Export all PBI reports CSV

## Key Files

### Backend
| File | Purpose |
|------|---------|
| `services/lineage.service.ts` | Core SSRS lineage building |
| `services/rdl.service.ts` | RDL parsing and analysis |
| `services/pbi-lineage.service.ts` | Power BI lineage building |
| `services/csv-export.service.ts` | Unified CSV export |
| `parsers/rdl.parser.ts` | RDL XML parsing |
| `parsers/sql.analyzer.ts` | SQL table extraction via regex |
| `parsers/excel.loader.ts` | Power BI Excel file parser |
| `routes/reports.routes.ts` | SSRS lineage query endpoints |
| `routes/pbi.routes.ts` | Power BI lineage endpoints |

### Frontend
| File | Purpose |
|------|---------|
| `pages/ReportManagement.jsx` | Main page with SSRS/PBI tabs |
| `pages/LineageViewer.jsx` | SSRS lineage visualization |
| `pages/PbiViewer.jsx` | Power BI lineage visualization |
| `components/ForceLineageGraph.jsx` | D3 force-directed graph |
| `components/NodeDetails.jsx` | SQL definition modal |
| `api/lineageApi.js` | API client |

## Development

```bash
# Run backend only
npm run backend

# Run frontend only
npm run frontend

# Build for production
npm run build
```

### Tech Stack
- **Backend**: Fastify, TypeScript, SQLite (better-sqlite3), Pino
- **Frontend**: React 18, Vite, D3, Axios, React Router
- **Database**: SQLite with 13 tables

### Database Tables
- `reports` - SSRS report metadata
- `datasets` - Report datasets
- `lineage` - SSRS relationships between entities (lineage edges)
- `stored_procedures` - Proc definitions
- `views` - View definitions
- `source_tables` - SQL2(D300SQLDW01) table metadata with server, database, PK info
- `data_sources` - Report data sources (from RDL XML)
- `shared_datasets` - SSRS shared datasets (SQL queries)
- `shared_data_sources` - SSRS shared data sources (actual connection strings)
- `linked_servers` - SQL Server linked servers
- `proc_dependencies` - SQL Server dependencies
- `metadata_status` - CSV loading status
- `report_execution_history` - SSRS execution stats (counts, last run, etc.)
- `report_executions` - Individual executions with parameters
- `pbi_reports` - Power BI report metadata
- `pbi_tables` - Power BI table mappings from Excel
- `pbi_lineage` - Power BI lineage edges
- `sql2_columns` - Table column metadata from SQL2 (for column comparison export)
- `trn1_columns` - Table column metadata from New Syspro TRN1 (for column comparison export)

## Node Types in Lineage Graph

| Type | Color | Description |
|------|-------|-------------|
| REPORT | Green | SSRS report |
| PBI_REPORT | Light Blue | Power BI report |
| DATASET | Blue | SSRS dataset |
| PBI_TABLE | Light Purple | Power BI table mapping |
| SHARED_DATASET | Cyan | SSRS shared dataset |
| PROC | Orange | Stored procedure |
| VIEW | Purple | Database view |
| TABLE | Red | Database table |

## Edge Types

- `CONTAINS` - Report contains dataset
- `CALLS` - Dataset calls stored proc
- `READS_FROM` - Proc/View reads from table
- `USES` - Dataset uses shared dataset

## Troubleshooting

- **Metadata not loading**: Check CSV files exist in `data/` folder
- **RDL files not found**: Check RDL files exist in `reports/` folder
- **Port in use**: Run `npm run clean` to kill processes on ports 3000/8080
- **Database issues**: Delete `backend/lineage.db` and restart to recreate

## Development Workflow

### After making backend code changes:
```bash
cd backend
npm run build    # Compile TypeScript
# Then restart the backend server
```

### After making frontend changes:
- Vite hot-reloads automatically, no rebuild needed

### SQL Queries
All SQL queries used to generate CSV files are in the `SQL/` folder. **Run these on D300SQLDW01 (SQL2):**
- `all_stored_procs.sql` - Stored procedures from ALL databases (dynamic query)
- `all_views.sql` - Views from ALL databases (dynamic query)
- `tables_with_pks.sql` - Tables from ALL databases (dynamic query)
- `all_dependencies.sql` - SQL Server dependencies from ALL databases (dynamic query)
- `shared_datasets.sql` - Shared datasets (SQL queries)
- `shared_datasources.sql` - Shared data sources (connection strings with actual server/database)
- `linked_servers.sql` - Linked servers
- `rdl_reports_bcp.txt` - BCP command to export RDL content from ReportServer
- `report_execution_history.sql` - Report execution stats from SSRS ExecutionLog
- `report_executions.sql` - Recent executions with parameters (last 30 days)

**Run on new Syspro server (TRN1):**
- `new_syspro_schema.sql` - Tables and views from new Syspro database (for "Available In New Syspro" column)
- `table_columns_trn1.sql` - Table/view columns from new Syspro (for column comparison export)

**Run on SQL2 (D300SQLDW01):**
- `table_columns_sql2.sql` - Table columns from SysproReporting database (for column comparison export)

**Note:** The dynamic queries automatically query ALL user databases on the server, excluding system databases (master, tempdb, msdb, model, ReportServer, ReportServerTempDB).

### RDL Source Options
The app supports two RDL sources (toggle in UI):
1. **Files** - Physical `.rdl` files in `reports/` folder
2. **Database** - `rdl_reports.csv` exported from ReportServer

To use Database source:
1. **Configure SSMS for tab-delimited export:**
   - Tools → Options → Query Results → SQL Server → Results to Text
   - Set "Output format" to `Tab Delimited`
   - Click OK
2. Run `SQL/rdl_reports_sqlcmd.sql` via SQLCMD (see file for instructions)
3. Press **Ctrl+Shift+F** (Results to File) before running
4. Save as `data/rdl_reports.txt` (NOT .csv - XML contains commas!)
5. Select "Database" source in UI
6. Click "Reload CSV" to load reports

**Important:** Always export as `.txt` (tab-delimited), not `.csv`. The RDL XML content contains commas which break CSV parsing.

### Refreshing Metadata
When SQL Server data changes:
1. Re-run the SQL queries in `SQL/` folder
2. Export to CSV files in `data/` folder
3. Click "Load Metadata" in UI
4. Delete `lineage.db` if schema changed

### Execution History Filters
When `report_execution_history.csv` is loaded, the RDL Management page shows filter checkboxes:
- **Hide never ran** - Skip reports with 0 executions
- **Hide stale (30+ days)** - Skip reports not run in 30+ days
- **Hide always-error** - Skip reports with 0 successes and >0 errors
- **Only subscription** - Show only reports with subscription runs

These filters affect which reports are shown in the list and processed by "Run All".

### Power BI Lineage

Power BI reports are loaded from the Excel file `data/FP Reporting_DataSourcesMapping.xlsx`.

**Expected Excel Format:**
- Sheet: "Source Tables"
- Data starts at row 6
- Columns: A=PBI File, B=PBI Table, F=Source Database, H=Unique view/table

**To load PBI data:**
1. Click the "Power BI Reports" tab
2. Click "Load Excel" button
3. The system will parse the Excel and populate `pbi_reports` and `pbi_tables`
4. Click any report to view its lineage graph

**Nested View Detection:**
The system automatically detects nested views by analyzing view definitions from the `views` table. When a PBI table references a view, the system recursively finds all tables/views that view depends on.

### Unified CSV Export

The Export dropdown provides three options:
- **SSRS Only** - Exports only SSRS reports with ReportType="SSRS"
- **Power BI Only** - Exports only PBI reports with ReportType="PowerBI"
- **All Reports** - Combined export with both types

All exports use the same CSV structure:

| Column | Description |
|--------|-------------|
| ReportType | SSRS or PowerBI |
| Report Name | Name of the report |
| Report Path | Full path to the report (SSRS only) |
| XML Dataset | Dataset name from RDL or PBI table name |
| XML Dataset Type | StoredProcedure, Text, SharedDataSet, or PowerBI |
| Proc1-Proc10 | Up to 10 stored procedures in the execution chain |
| View1-View10 | Up to 10 views in the execution chain |
| Comment | Overflow if more than 10 procs or views (lists additional ones) |
| Metadata Table | Base table name from database metadata |
| Metadata Schema | Schema name (dbo, stage, bi, etc.) |
| Linked Server | Linked server name if external reference |
| External Database | Database name for external/missing tables |
| In SQL2(D300SQLDW01) | Yes, No, NO TABLES, VIEW_NO_TABLES, NO SOURCE |
| SQL2(D300SQLDW01) Has PK | Yes, No, or - (unknown) |

**In SQL2(D300SQLDW01) Values:**
- `Yes` - Table found in SQL2(D300SQLDW01) database metadata (from tables_with_pks.csv)
- `No` - Table referenced but not found in any database on SQL2(D300SQLDW01)
- `NO TABLES` - Dataset has no table references (parameter parsing only)
- `VIEW_NO_TABLES` - View exists but has no traceable base tables
- `NO SOURCE` - Power BI table has no source entity specified

**Note:** Tables from ALL databases on SQL2(D300SQLDW01) are now loaded. Tables not found may be on external linked servers or missing from the server entirely.

### Table Columns Export (Starred Reports)

The Export dropdown includes two additional exports for comparing table columns between SQL2 and New Syspro (TRN1):

**Required CSV Files:**
- `table_columns_sql2.csv` - Column metadata from SQL2 (run `SQL/table_columns_sql2.sql` on D300SQLDW01)
- `table_columns_trn1.csv` - Column metadata from New Syspro (run `SQL/table_columns_trn1.sql` on TRN1)

**Export 1: Report-Table Mapping**
Shows which tables each starred report uses:
```csv
ReportType,ReportName,ReportPath,TableSchema,TableName
SSRS,Branch Summary,/Report/Executive/Branch Summary,syspro,ArTrnDetail
SSRS,Branch Summary,/Report/Executive/Branch Summary,dbo,DateDim
```

**Export 2: Unique Table Columns**
Shows all columns from tables used by starred reports, comparing SQL2 vs New Syspro:

| Column | Description |
|--------|-------------|
| Schema_In_Report | Schema referenced in the report (e.g., syspro) |
| TableName | Table name |
| ColumnName | Column name |
| InNewSyspro_TRN1 | Yes/No - Does column exist in New Syspro? |
| NewSyspro_TRN1_DataType | Data type in New Syspro |
| NewSyspro_TRN1_MaxLength | Max length in New Syspro |
| NewSyspro_TRN1_Nullable | Nullable in New Syspro |
| InSQL2 | Yes/No - Does column exist in SQL2? |
| SQL2_Schema | Actual schema where table exists in SQL2 |
| SQL2_DataType | Data type in SQL2 |
| SQL2_MaxLength | Max length in SQL2 |
| SQL2_Nullable | Nullable in SQL2 |

**How Column Comparison Works:**
1. For each table used by starred reports, get columns from BOTH SQL2 and New Syspro
2. Merge all unique columns (no duplicates)
3. Mark which system(s) each column exists in

| Scenario | InNewSyspro_TRN1 | InSQL2 | Meaning |
|----------|------------------|--------|---------|
| Column in both | Yes | Yes | Exists in both systems |
| Column in SQL2 only | No | Yes | May be removed in New Syspro |
| Column in New Syspro only | Yes | No | New column in New Syspro |

**Schema Matching:**
- First tries to match using the report's schema (e.g., `syspro.ArTrnDetail`)
- If table exists in multiple schemas in SQL2, prefers the schema matching the report
- Falls back to searching by table name only if not found in report's schema
