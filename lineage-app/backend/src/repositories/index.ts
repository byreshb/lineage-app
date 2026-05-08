import Database from 'better-sqlite3';
import { ReportRepository } from './report.repository.js';
import { LineageRepository } from './lineage.repository.js';
import { DatasetRepository } from './dataset.repository.js';
import { StoredProcRepository } from './stored-proc.repository.js';
import { ViewRepository } from './view.repository.js';
import { TableRepository } from './table.repository.js';
import { DataSourceRepository } from './data-source.repository.js';
import { SharedDatasetRepository } from './shared-dataset.repository.js';
import { SharedDataSourceRepository } from './shared-data-source.repository.js';
import { LinkedServerRepository } from './linked-server.repository.js';
import { ProcDependencyRepository } from './proc-dependency.repository.js';
import { MetadataStatusRepository } from './metadata-status.repository.js';
import { ExecutionHistoryRepository } from './execution-history.repository.js';
import { ReportExecutionRepository } from './report-execution.repository.js';
import { PbiReportRepository } from './pbi-report.repository.js';
import { PbiTableRepository } from './pbi-table.repository.js';
import { PbiLineageRepository } from './pbi-lineage.repository.js';
import { LinkedReportRepository } from './linked-report.repository.js';
import { Trn1SchemaRepository } from './trn1-schema.repository.js';

export {
  ReportRepository,
  LineageRepository,
  DatasetRepository,
  StoredProcRepository,
  ViewRepository,
  TableRepository,
  DataSourceRepository,
  SharedDatasetRepository,
  SharedDataSourceRepository,
  LinkedServerRepository,
  ProcDependencyRepository,
  MetadataStatusRepository,
  ExecutionHistoryRepository,
  ReportExecutionRepository,
  PbiReportRepository,
  PbiTableRepository,
  PbiLineageRepository,
  LinkedReportRepository,
  Trn1SchemaRepository,
};

// Repository container for dependency injection
export interface Repositories {
  report: ReportRepository;
  lineage: LineageRepository;
  dataset: DatasetRepository;
  storedProc: StoredProcRepository;
  view: ViewRepository;
  table: TableRepository;
  dataSource: DataSourceRepository;
  sharedDataset: SharedDatasetRepository;
  sharedDataSource: SharedDataSourceRepository;
  linkedServer: LinkedServerRepository;
  procDependency: ProcDependencyRepository;
  metadataStatus: MetadataStatusRepository;
  executionHistory: ExecutionHistoryRepository;
  reportExecution: ReportExecutionRepository;
  pbiReport: PbiReportRepository;
  pbiTable: PbiTableRepository;
  pbiLineage: PbiLineageRepository;
  linkedReport: LinkedReportRepository;
  trn1Schema: Trn1SchemaRepository;
}

export function createRepositories(db: Database.Database): Repositories {
  return {
    report: new ReportRepository(db),
    lineage: new LineageRepository(db),
    dataset: new DatasetRepository(db),
    storedProc: new StoredProcRepository(db),
    view: new ViewRepository(db),
    table: new TableRepository(db),
    dataSource: new DataSourceRepository(db),
    sharedDataset: new SharedDatasetRepository(db),
    sharedDataSource: new SharedDataSourceRepository(db),
    linkedServer: new LinkedServerRepository(db),
    procDependency: new ProcDependencyRepository(db),
    metadataStatus: new MetadataStatusRepository(db),
    executionHistory: new ExecutionHistoryRepository(db),
    reportExecution: new ReportExecutionRepository(db),
    pbiReport: new PbiReportRepository(db),
    pbiTable: new PbiTableRepository(db),
    pbiLineage: new PbiLineageRepository(db),
    linkedReport: new LinkedReportRepository(db),
    trn1Schema: new Trn1SchemaRepository(db),
  };
}
