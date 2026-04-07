// Report status enum
export type ReportStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ERROR';

// Dataset command type enum
export type CommandType = 'StoredProcedure' | 'Text' | 'SharedDataSet';

// Lineage node type enum
export type NodeType =
  | 'REPORT' | 'DATASET' | 'PROC' | 'VIEW' | 'TABLE' | 'SHARED_DATASET'
  | 'PROC_NOT_FOUND' | 'VIEW_NOT_FOUND' | 'TABLE_NOT_FOUND' | 'SHARED_DATASET_NOT_FOUND';

// Lineage relationship enum
export type Relationship = 'CONTAINS' | 'CALLS' | 'READS_FROM' | 'USES';

// Discovery method enum
export type DiscoveryMethod = 'REGEX' | 'SQL_SERVER' | 'BOTH' | 'DYNAMIC';

// Source table type enum
export type SourceType = 'LOCAL' | 'LINKED_SERVER' | 'DYNAMIC' | 'CROSS_DATABASE';

// RDL Source type
export type RdlSource = 'FILES' | 'DATABASE';

// Report entity
export interface Report {
  id: number | null;
  fileName: string;
  filePath: string;
  reportName: string | null;
  source: RdlSource;
  status: ReportStatus;
  starred: boolean;
  lastRunAt: string | null;
  errorMessage: string | null;
  createdAt: string | null;
}

// Dataset entity
export interface Dataset {
  id: number | null;
  reportId: number;
  datasetName: string;
  commandType: CommandType | null;
  commandText: string | null;
  sharedDatasetPath: string | null;
  fields: string | null;
}

// LineageEdge entity
export interface LineageEdge {
  id: number | null;
  reportId: number;
  sourceType: NodeType;
  sourceId: number;
  sourceName: string | null;
  targetType: NodeType;
  targetId: number;
  targetName: string | null;
  relationship: Relationship;
  discoveryMethod: DiscoveryMethod;
}

// DataSource entity
export interface DataSource {
  id: number | null;
  reportId: number;
  sourceName: string;
  sourceType: string | null;
  referencePath: string | null;
  connectionString: string | null;
  server: string | null;
  databaseName: string | null;
}

// StoredProcedure entity
export interface StoredProcedure {
  id: number | null;
  schemaName: string;
  procName: string;
  definition: string | null;
}

// View entity
export interface View {
  id: number | null;
  databaseName: string | null;
  schemaName: string;
  viewName: string;
  definition: string | null;
}

// SourceTable entity
export interface SourceTable {
  id: number | null;
  server: string | null;
  databaseName: string | null;
  schemaName: string;
  tableName: string;
  hasPk: boolean | null;
  sourceType: SourceType | null;
}

// SharedDataset entity
export interface SharedDataset {
  id: number | null;
  datasetName: string;
  datasetPath: string | null;
  commandType: string | null;
  commandText: string | null;
}

// LinkedServer entity
export interface LinkedServer {
  id: number | null;
  alias: string;
  actualServer: string | null;
  provider: string | null;
}

// ProcDependency entity
export interface ProcDependency {
  id: number | null;
  objectSchema: string;
  objectName: string;
  objectType: string | null;
  dependsOnSchema: string | null;
  dependsOnName: string | null;
  dependsOnType: string | null;
}

// SharedDataSource entity (from SSRS ReportServer - actual connection info)
export interface SharedDataSource {
  id: number | null;
  dataSourceName: string;
  dataSourcePath: string | null;
  connectionString: string | null;
  extension: string | null;
  server: string | null;
  databaseName: string | null;
}

// MetadataStatus entity
export interface MetadataStatus {
  id: number;
  loadedAt: string | null;
  procCount: number;
  viewCount: number;
  tableCount: number;
  sharedDatasetCount: number;
  sharedDataSourceCount: number;
  linkedServerCount: number;
  dependencyCount: number;
}

// ReportExecutionHistory entity (from SSRS ExecutionLog - aggregated stats)
export interface ReportExecutionHistory {
  id: number | null;
  reportName: string;
  reportPath: string;
  executionCount: number;
  lastExecutedAt: string | null;
  firstExecutedAt: string | null;
  daysSinceLastRun: number | null;
  successCount: number;
  errorCount: number;
  interactiveCount: number;
  subscriptionCount: number;
}

// ReportExecution entity (from SSRS ExecutionLog3 - individual executions with parameters)
export interface ReportExecution {
  id: number | null;
  reportPath: string;
  executedAt: string;
  status: string | null;
  requestType: string | null;
  userName: string | null;
  parameters: string | null;
}

export interface LinkedReport {
  id: number | null;
  linkedReportName: string;
  linkedReportPath: string;
  templatePath: string;
  starred: boolean;
}
