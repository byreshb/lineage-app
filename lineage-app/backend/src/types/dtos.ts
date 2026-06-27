import { ReportStatus } from "./entities.js";

// RDL file info for scan results
export interface RdlFileDto {
  fileName: string;
  filePath: string;
  status: ReportStatus | null;
  lastRunAt: string | null;
  errorMessage: string | null;
  reportId: number | null;
  reportName: string | null;
  starred?: boolean;
  // Execution history fields (from SSRS ExecutionLog)
  executionCount?: number;
  lastExecutedAt?: string | null;
  daysSinceLastRun?: number | null;
  successCount?: number;
  errorCount?: number;
  interactiveCount?: number;
  subscriptionCount?: number;
  neverRan?: boolean;
}

// Processing status for batch analysis
export interface ProcessingStatusDto {
  isRunning: boolean;
  totalFiles: number;
  completedFiles: number;
  errorFiles: number;
  currentFile: string | null;
  completed: boolean;
  progressPercent: number;
  elapsedSeconds: number;
  estimatedSecondsRemaining: number;
  averageSecondsPerFile: number;
}

// Lineage node for graph visualization
export interface LineageNodeDto {
  id: string;
  name: string;
  type: string;
  server: string | null;
  database: string | null;
  schema: string | null;
  hasPk: boolean | null;
  sourceType: string | null;
}

// Lineage edge for graph visualization
export interface LineageEdgeDto {
  source: string;
  target: string;
  relationship: string;
  discoveryMethod: string;
}

// Parsing warning
export interface ParsingWarningDto {
  entityType: string;
  entityName: string;
  warning: string;
}

// Complete lineage graph response
export interface LineageGraphDto {
  reportId: number;
  reportName: string;
  lastAnalyzed: string | null;
  nodes: LineageNodeDto[];
  edges: LineageEdgeDto[];
  warnings: ParsingWarningDto[];
}

// Source table details
export interface SourceTableDto {
  id: number;
  server: string | null;
  databaseName: string | null;
  schemaName: string;
  tableName: string;
  hasPk: boolean | null;
  sourceType: string | null;
  discoveryMethod: string;
  status: "Yes" | "No" | "NO_TABLES";
  isAvailableInNewSyspro: boolean | null;
}

// Metadata status response
export interface MetadataStatusDto {
  loaded: boolean;
  loadedAt: string | null;
  procCount: number;
  viewCount: number;
  tableCount: number;
  sharedDatasetCount: number;
  sharedDataSourceCount: number;
  linkedServerCount: number;
  dependencyCount: number;
}

// Data source with both XML and Metadata info
export interface DataSourceDto {
  sourceName: string;
  sourceType: string | null;
  referencePath: string | null;
  // From XML (RDL file)
  xmlServer: string | null;
  xmlDatabase: string | null;
  // From Metadata (shared_datasources.csv)
  metadataServer: string | null;
  metadataDatabase: string | null;
}
