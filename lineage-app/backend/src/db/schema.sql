-- Core entities (populated from CSVs - one time)
CREATE TABLE IF NOT EXISTS stored_procedures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_name TEXT NOT NULL,
    proc_name TEXT NOT NULL,
    definition TEXT,
    UNIQUE(schema_name, proc_name)
);

CREATE TABLE IF NOT EXISTS views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    database_name TEXT,
    schema_name TEXT NOT NULL,
    view_name TEXT NOT NULL,
    definition TEXT,
    UNIQUE(database_name, schema_name, view_name)
);

CREATE TABLE IF NOT EXISTS source_tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server TEXT,
    database_name TEXT,
    schema_name TEXT NOT NULL,
    table_name TEXT NOT NULL,
    has_pk BOOLEAN,
    source_type TEXT,
    UNIQUE(server, database_name, schema_name, table_name)
);

-- Reports (populated when RDL is analyzed)
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    report_name TEXT,
    source TEXT DEFAULT 'FILES',
    status TEXT DEFAULT 'PENDING',
    starred INTEGER DEFAULT 0,
    last_run_at TEXT,
    error_message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(file_name, file_path, source)
);

CREATE TABLE IF NOT EXISTS datasets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
    dataset_name TEXT NOT NULL,
    command_type TEXT,
    command_text TEXT,
    shared_dataset_path TEXT,
    fields TEXT
);

-- Lineage edges (rebuilt on each analysis)
CREATE TABLE IF NOT EXISTS lineage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    source_name TEXT,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    target_name TEXT,
    relationship TEXT,
    discovery_method TEXT DEFAULT 'REGEX'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_lineage_report ON lineage(report_id);
CREATE INDEX IF NOT EXISTS idx_datasets_report ON datasets(report_id);
CREATE INDEX IF NOT EXISTS idx_stored_procedures_name ON stored_procedures(proc_name);
CREATE INDEX IF NOT EXISTS idx_views_name ON views(view_name);
CREATE INDEX IF NOT EXISTS idx_source_tables_name ON source_tables(table_name);

-- Metadata status table
CREATE TABLE IF NOT EXISTS metadata_status (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    loaded_at TEXT,
    proc_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    table_count INTEGER DEFAULT 0,
    shared_dataset_count INTEGER DEFAULT 0,
    shared_data_source_count INTEGER DEFAULT 0,
    linked_server_count INTEGER DEFAULT 0,
    dependency_count INTEGER DEFAULT 0
);

-- Data sources (extracted from RDL files)
CREATE TABLE IF NOT EXISTS data_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
    source_name TEXT NOT NULL,
    source_type TEXT,
    reference_path TEXT,
    connection_string TEXT,
    server TEXT,
    database_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_data_sources_report ON data_sources(report_id);

-- SharedDatasets (from ReportServer - actual SQL for shared datasets)
CREATE TABLE IF NOT EXISTS shared_datasets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dataset_name TEXT NOT NULL UNIQUE,
    dataset_path TEXT,
    command_type TEXT,
    command_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_shared_datasets_name ON shared_datasets(dataset_name);
CREATE INDEX IF NOT EXISTS idx_shared_datasets_path ON shared_datasets(dataset_path);

-- Linked Servers (alias → actual server name)
CREATE TABLE IF NOT EXISTS linked_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias TEXT NOT NULL UNIQUE,
    actual_server TEXT,
    provider TEXT
);

CREATE INDEX IF NOT EXISTS idx_linked_servers_alias ON linked_servers(alias);

-- Object dependencies (from SQL Server sys.sql_expression_dependencies)
CREATE TABLE IF NOT EXISTS proc_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    object_schema TEXT NOT NULL,
    object_name TEXT NOT NULL,
    object_type TEXT,
    depends_on_schema TEXT,
    depends_on_name TEXT,
    depends_on_type TEXT
);

CREATE INDEX IF NOT EXISTS idx_proc_deps_object ON proc_dependencies(object_schema, object_name);
CREATE INDEX IF NOT EXISTS idx_proc_deps_target ON proc_dependencies(depends_on_schema, depends_on_name);

-- Shared Data Sources (from SSRS ReportServer - actual connection info)
CREATE TABLE IF NOT EXISTS shared_data_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data_source_name TEXT NOT NULL,
    data_source_path TEXT UNIQUE,
    connection_string TEXT,
    extension TEXT,
    server TEXT,
    database_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_shared_data_sources_name ON shared_data_sources(data_source_name);
CREATE INDEX IF NOT EXISTS idx_shared_data_sources_path ON shared_data_sources(data_source_path);

-- Report execution history (from SSRS ExecutionLog - aggregated stats)
CREATE TABLE IF NOT EXISTS report_execution_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_name TEXT NOT NULL,
    report_path TEXT NOT NULL UNIQUE,
    execution_count INTEGER DEFAULT 0,
    last_executed_at TEXT,
    first_executed_at TEXT,
    days_since_last_run INTEGER,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    interactive_count INTEGER DEFAULT 0,
    subscription_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_exec_history_path ON report_execution_history(report_path);

-- Report executions with parameters (from SSRS ExecutionLog3 - recent individual executions)
CREATE TABLE IF NOT EXISTS report_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_path TEXT NOT NULL,
    executed_at TEXT NOT NULL,
    status TEXT,
    request_type TEXT,
    user_name TEXT,
    parameters TEXT
);

CREATE INDEX IF NOT EXISTS idx_report_executions_path ON report_executions(report_path);
CREATE INDEX IF NOT EXISTS idx_report_executions_time ON report_executions(executed_at);

-- Power BI Reports
CREATE TABLE IF NOT EXISTS pbi_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_name TEXT NOT NULL UNIQUE,
    starred INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Power BI Tables (tables within a PBI report from Excel mapping)
CREATE TABLE IF NOT EXISTS pbi_tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pbi_report_id INTEGER NOT NULL,
    table_name TEXT NOT NULL,
    source_database TEXT,
    source_view_or_table TEXT,
    FOREIGN KEY (pbi_report_id) REFERENCES pbi_reports(id) ON DELETE CASCADE
);

-- Power BI Lineage (edges for D3 visualization)
CREATE TABLE IF NOT EXISTS pbi_lineage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pbi_report_id INTEGER NOT NULL,
    source_type TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    source_name TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER,
    target_name TEXT NOT NULL,
    relationship TEXT NOT NULL,
    FOREIGN KEY (pbi_report_id) REFERENCES pbi_reports(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pbi_reports_name ON pbi_reports(report_name);
CREATE INDEX IF NOT EXISTS idx_pbi_tables_report ON pbi_tables(pbi_report_id);
CREATE INDEX IF NOT EXISTS idx_pbi_lineage_report ON pbi_lineage(pbi_report_id);

-- Linked Reports (Type 4 in SSRS - shortcuts pointing to template reports)
-- Maps linked report names/paths to their source template reports
CREATE TABLE IF NOT EXISTS linked_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    linked_report_name TEXT NOT NULL,
    linked_report_path TEXT NOT NULL UNIQUE,
    template_path TEXT NOT NULL,
    starred INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_linked_reports_name ON linked_reports(linked_report_name);
CREATE INDEX IF NOT EXISTS idx_linked_reports_path ON linked_reports(linked_report_path);
CREATE INDEX IF NOT EXISTS idx_linked_reports_template ON linked_reports(template_path);
