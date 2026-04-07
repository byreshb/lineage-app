import fs from 'fs';
import path from 'path';
import { resolvedPaths } from '../config/index.js';
import { Repositories } from '../repositories/index.js';
import { MetadataStatusDto } from '../types/index.js';
import {
  loadStoredProcedures,
  loadViews,
  loadTables,
  loadSharedDatasets,
  loadSharedDataSources,
  loadLinkedServers,
  loadDependencies,
  loadReportExecutionHistory,
  loadReportExecutions,
  loadLinkedReports,
} from '../parsers/csv.loader.js';
import dayjs from 'dayjs';

export class MetadataService {
  constructor(private repos: Repositories) {}

  async loadMetadata(csvFolderPath?: string): Promise<void> {
    const folder = csvFolderPath || resolvedPaths.csvFolder;
    console.log(`Loading metadata from folder: ${folder}`);

    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
      throw new Error(`CSV folder does not exist: ${folder}`);
    }

    // Clear existing data
    this.repos.storedProc.deleteAll();
    this.repos.view.deleteAll();
    this.repos.table.deleteAll();
    this.repos.sharedDataset.deleteAll();
    this.repos.sharedDataSource.deleteAll();
    this.repos.linkedServer.deleteAll();
    this.repos.procDependency.deleteAll();
    this.repos.executionHistory.deleteAll();
    this.repos.reportExecution.deleteAll();
    this.repos.linkedReport.deleteAll();

    let procCount = 0, viewCount = 0, tableCount = 0, linkedReportCount = 0;
    let sharedDatasetCount = 0, sharedDataSourceCount = 0, linkedServerCount = 0, dependencyCount = 0;
    let executionHistoryCount = 0;

    // Load stored procedures
    const procsFile = this.findFile(folder, 'sysproreporting_stored_procs.csv', 'ssrs_stored_procs.csv', 'stored_proc', 'procs.csv');
    if (procsFile) {
      const procs = loadStoredProcedures(procsFile);
      this.repos.storedProc.saveAll(procs);
      procCount = procs.length;
    }

    // Load views
    const viewsFile = this.findFile(folder, 'all_views.csv', 'views.csv');
    if (viewsFile) {
      const views = loadViews(viewsFile);
      this.repos.view.saveAll(views);
      viewCount = views.length;
    }

    // Load tables
    const tablesFile = this.findFile(folder, 'tables_with_pks.csv', 'tables.csv', 'all_tables.csv');
    if (tablesFile) {
      const tables = loadTables(tablesFile);
      this.repos.table.saveAll(tables);
      tableCount = tables.length;
    }

    // Load shared datasets
    const sharedDatasetsFile = this.findFile(folder, 'shared_datasets.csv');
    if (sharedDatasetsFile) {
      const datasets = loadSharedDatasets(sharedDatasetsFile);
      this.repos.sharedDataset.saveAll(datasets);
      sharedDatasetCount = datasets.length;
    }

    // Load shared data sources (actual connection info from SSRS)
    const sharedDataSourcesFile = this.findFile(folder, 'shared_datasources.csv');
    if (sharedDataSourcesFile) {
      const dataSources = loadSharedDataSources(sharedDataSourcesFile);
      this.repos.sharedDataSource.saveAll(dataSources);
      sharedDataSourceCount = dataSources.length;
    }

    // Load linked servers
    const linkedServersFile = this.findFile(folder, 'linked_servers.csv');
    if (linkedServersFile) {
      const servers = loadLinkedServers(linkedServersFile);
      this.repos.linkedServer.saveAll(servers);
      linkedServerCount = servers.length;
    }

    // Load dependencies
    const dependenciesFile = this.findFile(folder, 'dependencies.csv');
    if (dependenciesFile) {
      const deps = loadDependencies(dependenciesFile);
      this.repos.procDependency.saveAll(deps);
      dependencyCount = deps.length;
    }

    // Load report execution history (aggregated stats)
    const executionHistoryFile = this.findFile(folder, 'report_execution_history.csv');
    if (executionHistoryFile) {
      const history = loadReportExecutionHistory(executionHistoryFile);
      this.repos.executionHistory.saveAll(history);
      executionHistoryCount = history.length;
      // Debug: log some stats
      const neverRanCount = history.filter(h => h.executionCount === 0).length;
      console.log(`Execution history: ${history.length} total, ${neverRanCount} never ran`);
      if (history.length > 0) {
        console.log(`Sample path: "${history[0].reportPath}"`);
      }
    } else {
      console.log('No report_execution_history.csv found');
    }

    // Load report executions with parameters (individual executions)
    let reportExecutionCount = 0;
    const reportExecutionsFile = this.findFile(folder, 'report_executions.csv', 'report_executions.txt');
    if (reportExecutionsFile) {
      const executions = loadReportExecutions(reportExecutionsFile);
      this.repos.reportExecution.saveAll(executions);
      reportExecutionCount = executions.length;
      console.log(`Report executions with parameters: ${reportExecutionCount} records`);
    } else {
      console.log('No report_executions.csv found');
    }

    // Load linked reports (Type 4 SSRS reports mapped to templates)
    const linkedReportsFile = this.findFile(folder, 'linked_reports.csv');
    if (linkedReportsFile) {
      const linkedReports = loadLinkedReports(linkedReportsFile);
      this.repos.linkedReport.saveAll(linkedReports.map(lr => ({
        id: null,
        linkedReportName: lr.linkedReportName,
        linkedReportPath: lr.linkedReportPath,
        templatePath: lr.templatePath,
        starred: false,
      })));
      linkedReportCount = linkedReports.length;
      console.log(`Linked reports: ${linkedReportCount} records`);
    } else {
      console.log('No linked_reports.csv found');
    }

    // Update metadata status
    this.repos.metadataStatus.updateCounts(
      procCount, viewCount, tableCount,
      sharedDatasetCount, sharedDataSourceCount, linkedServerCount, dependencyCount
    );

    console.log(`Metadata loading complete: ${procCount} procs, ${viewCount} views, ${tableCount} tables, ${sharedDatasetCount} shared datasets, ${sharedDataSourceCount} shared data sources, ${linkedServerCount} linked servers, ${dependencyCount} dependencies, ${executionHistoryCount} execution history, ${linkedReportCount} linked reports`);
  }

  getStatus(): MetadataStatusDto {
    const status = this.repos.metadataStatus.get();
    if (!status || !status.loadedAt) {
      return {
        loaded: false,
        loadedAt: null,
        procCount: 0,
        viewCount: 0,
        tableCount: 0,
        sharedDatasetCount: 0,
        sharedDataSourceCount: 0,
        linkedServerCount: 0,
        dependencyCount: 0,
      };
    }

    return {
      loaded: true,
      loadedAt: this.formatForDisplay(status.loadedAt),
      procCount: status.procCount,
      viewCount: status.viewCount,
      tableCount: status.tableCount,
      sharedDatasetCount: status.sharedDatasetCount,
      sharedDataSourceCount: status.sharedDataSourceCount || 0,
      linkedServerCount: status.linkedServerCount,
      dependencyCount: status.dependencyCount,
    };
  }

  private findFile(folder: string, ...possibleNames: string[]): string | null {
    for (const name of possibleNames) {
      const filePath = path.join(folder, name);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return filePath;
      }
    }

    // Try to find any matching file
    const files = fs.readdirSync(folder);
    for (const file of files) {
      const fileName = file.toLowerCase();
      for (const name of possibleNames) {
        if (fileName.includes(name.toLowerCase().replace('.csv', ''))) {
          return path.join(folder, file);
        }
      }
    }

    return null;
  }

  private formatForDisplay(timeStr: string | null): string | null {
    if (!timeStr) return null;
    try {
      return dayjs(timeStr).format('MMM D, YYYY h:mm A');
    } catch {
      return timeStr;
    }
  }
}
