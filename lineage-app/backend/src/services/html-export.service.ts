import { Repositories } from '../repositories/index.js';
import { LineageService } from './lineage.service.js';
import { PbiLineageService } from './pbi-lineage.service.js';
import { LineageGraphDto, ReportExecution } from '../types/index.js';

interface ExecutionData {
  executedAt: string;
  status: string | null;
  requestType: string | null;
  userName: string | null;
  parameters: string | null;
}

interface ReportLineageData {
  id: number;
  reportName: string;
  reportPath: string;
  lineage: LineageGraphDto;
  executions: ExecutionData[];
}

interface ExportData {
  reports: ReportLineageData[];
  procDefinitions: Record<string, string>;
  viewDefinitions: Record<string, string>;
  sharedDatasetDefinitions: Record<string, string>;
}

export class HtmlExportService {
  constructor(
    private repos: Repositories,
    private lineageService: LineageService,
    private pbiLineageService: PbiLineageService
  ) {}

  exportSingleReportAsHtml(reportId: number): string {
    // 1. Get the single report
    const report = this.repos.report.findById(reportId);
    if (!report) {
      throw new Error(`Report not found: ${reportId}`);
    }

    // 2. Build lineage data for this report
    const exportData: ExportData = {
      reports: [],
      procDefinitions: {},
      viewDefinitions: {},
      sharedDatasetDefinitions: {},
    };

    const procIds = new Set<number>();
    const viewIds = new Set<number>();
    const sharedDatasetIds = new Set<number>();

    const lineage = this.lineageService.getLineageGraph(report.id!);

    // Get executions for this report
    const executions = this.repos.reportExecution.findByPathLimited(report.filePath, 20);
    const executionData: ExecutionData[] = executions.map(e => ({
      executedAt: e.executedAt,
      status: e.status,
      requestType: e.requestType,
      userName: e.userName,
      parameters: e.parameters,
    }));

    exportData.reports.push({
      id: report.id!,
      reportName: report.reportName || report.fileName,
      reportPath: report.filePath,
      lineage,
      executions: executionData,
    });

    // Collect proc/view/shared dataset IDs for definitions
    for (const node of lineage.nodes) {
      if (node.type === 'PROC' && node.id) {
        const match = node.id.match(/PROC_(\d+)/);
        if (match) procIds.add(parseInt(match[1], 10));
      }
      if (node.type === 'VIEW' && node.id) {
        const match = node.id.match(/VIEW_(\d+)/);
        if (match) viewIds.add(parseInt(match[1], 10));
      }
      if (node.type === 'SHARED_DATASET' && node.id) {
        const match = node.id.match(/SHARED_DATASET_(\d+)/);
        if (match) sharedDatasetIds.add(parseInt(match[1], 10));
      }
    }

    // 3. Fetch definitions
    for (const procId of procIds) {
      const proc = this.repos.storedProc.findById(procId);
      if (proc && proc.definition) {
        exportData.procDefinitions[`PROC_${procId}`] = proc.definition;
      }
    }

    for (const viewId of viewIds) {
      const view = this.repos.view.findById(viewId);
      if (view && view.definition) {
        exportData.viewDefinitions[`VIEW_${viewId}`] = view.definition;
      }
    }

    for (const sdId of sharedDatasetIds) {
      const sd = this.repos.sharedDataset.findById(sdId);
      if (sd && sd.commandText) {
        exportData.sharedDatasetDefinitions[`SHARED_DATASET_${sdId}`] = sd.commandText;
      }
    }

    // 4. Generate HTML
    return this.generateHtml(exportData);
  }

  exportAllAsHtml(): string {
    // 1. Get all completed reports
    const reports = this.repos.report.findAll().filter(r => r.status === 'COMPLETED');

    // 2. Build lineage data for each report
    const exportData: ExportData = {
      reports: [],
      procDefinitions: {},
      viewDefinitions: {},
      sharedDatasetDefinitions: {},
    };

    const procIds = new Set<number>();
    const viewIds = new Set<number>();
    const sharedDatasetIds = new Set<number>();

    for (const report of reports) {
      try {
        const lineage = this.lineageService.getLineageGraph(report.id!);

        // Get executions for this report
        const executions = this.repos.reportExecution.findByPathLimited(report.filePath, 20);
        const executionData: ExecutionData[] = executions.map(e => ({
          executedAt: e.executedAt,
          status: e.status,
          requestType: e.requestType,
          userName: e.userName,
          parameters: e.parameters,
        }));

        exportData.reports.push({
          id: report.id!,
          reportName: report.reportName || report.fileName,
          reportPath: report.filePath,
          lineage,
          executions: executionData,
        });

        // Collect proc/view/shared dataset IDs for definitions
        for (const node of lineage.nodes) {
          if (node.type === 'PROC' && node.id) {
            const match = node.id.match(/PROC_(\d+)/);
            if (match) procIds.add(parseInt(match[1], 10));
          }
          if (node.type === 'VIEW' && node.id) {
            const match = node.id.match(/VIEW_(\d+)/);
            if (match) viewIds.add(parseInt(match[1], 10));
          }
          if (node.type === 'SHARED_DATASET' && node.id) {
            const match = node.id.match(/SHARED_DATASET_(\d+)/);
            if (match) sharedDatasetIds.add(parseInt(match[1], 10));
          }
        }
      } catch (err) {
        console.warn(`Failed to get lineage for report ${report.fileName}:`, err);
      }
    }

    // 3. Fetch definitions
    for (const procId of procIds) {
      const proc = this.repos.storedProc.findById(procId);
      if (proc && proc.definition) {
        exportData.procDefinitions[`PROC_${procId}`] = proc.definition;
      }
    }

    for (const viewId of viewIds) {
      const view = this.repos.view.findById(viewId);
      if (view && view.definition) {
        exportData.viewDefinitions[`VIEW_${viewId}`] = view.definition;
      }
    }

    for (const sdId of sharedDatasetIds) {
      const sd = this.repos.sharedDataset.findById(sdId);
      if (sd && sd.commandText) {
        exportData.sharedDatasetDefinitions[`SHARED_DATASET_${sdId}`] = sd.commandText;
      }
    }

    // 4. Generate HTML
    return this.generateHtml(exportData);
  }

  exportStarredAsHtml(reportIds: number[]): string {
    // 1. Get reports by IDs
    const reports = reportIds
      .map(id => this.repos.report.findById(id))
      .filter(r => r && r.status === 'COMPLETED');

    if (reports.length === 0) {
      throw new Error('No starred reports found');
    }

    // 2. Build lineage data for each report
    const exportData: ExportData = {
      reports: [],
      procDefinitions: {},
      viewDefinitions: {},
      sharedDatasetDefinitions: {},
    };

    const procIds = new Set<number>();
    const viewIds = new Set<number>();
    const sharedDatasetIds = new Set<number>();

    for (const report of reports) {
      if (!report) continue;
      try {
        const lineage = this.lineageService.getLineageGraph(report.id!);

        // Get executions for this report
        const executions = this.repos.reportExecution.findByPathLimited(report.filePath, 20);
        const executionData: ExecutionData[] = executions.map(e => ({
          executedAt: e.executedAt,
          status: e.status,
          requestType: e.requestType,
          userName: e.userName,
          parameters: e.parameters,
        }));

        exportData.reports.push({
          id: report.id!,
          reportName: report.reportName || report.fileName,
          reportPath: report.filePath,
          lineage,
          executions: executionData,
        });

        // Collect proc/view/shared dataset IDs for definitions
        for (const node of lineage.nodes) {
          if (node.type === 'PROC' && node.id) {
            const match = node.id.match(/PROC_(\d+)/);
            if (match) procIds.add(parseInt(match[1], 10));
          }
          if (node.type === 'VIEW' && node.id) {
            const match = node.id.match(/VIEW_(\d+)/);
            if (match) viewIds.add(parseInt(match[1], 10));
          }
          if (node.type === 'SHARED_DATASET' && node.id) {
            const match = node.id.match(/SHARED_DATASET_(\d+)/);
            if (match) sharedDatasetIds.add(parseInt(match[1], 10));
          }
        }
      } catch (err) {
        console.warn(`Failed to get lineage for report ${report.fileName}:`, err);
      }
    }

    // 3. Fetch definitions
    for (const procId of procIds) {
      const proc = this.repos.storedProc.findById(procId);
      if (proc && proc.definition) {
        exportData.procDefinitions[`PROC_${procId}`] = proc.definition;
      }
    }

    for (const viewId of viewIds) {
      const view = this.repos.view.findById(viewId);
      if (view && view.definition) {
        exportData.viewDefinitions[`VIEW_${viewId}`] = view.definition;
      }
    }

    for (const sdId of sharedDatasetIds) {
      const sd = this.repos.sharedDataset.findById(sdId);
      if (sd && sd.commandText) {
        exportData.sharedDatasetDefinitions[`SHARED_DATASET_${sdId}`] = sd.commandText;
      }
    }

    // 4. Generate HTML
    return this.generateHtml(exportData);
  }

  /**
   * Export all Power BI reports as HTML
   */
  exportPbiAllAsHtml(): string {
    const pbiReports = this.repos.pbiReport.findAll();
    return this.buildPbiHtml(pbiReports, 'Power BI Report Lineage');
  }

  /**
   * Export starred Power BI reports as HTML
   */
  exportPbiStarredAsHtml(): string {
    const pbiReports = this.repos.pbiReport.findStarred();
    if (pbiReports.length === 0) {
      throw new Error('No starred Power BI reports found');
    }
    return this.buildPbiHtml(pbiReports, 'Power BI Report Lineage (Starred)');
  }

  /**
   * Build HTML for Power BI reports
   */
  private buildPbiHtml(pbiReports: any[], title: string): string {
    const exportData: ExportData = {
      reports: [],
      procDefinitions: {},
      viewDefinitions: {},
      sharedDatasetDefinitions: {},
    };

    const procIds = new Set<number>();
    const viewIds = new Set<number>();

    for (const report of pbiReports) {
      try {
        // Build lineage if not exists, then get it
        const lineage = this.pbiLineageService.getLineageGraph(report.id!);

        // Convert PBI lineage format to SSRS format for the HTML viewer
        const convertedLineage: LineageGraphDto = {
          reportId: report.id!,
          reportName: report.reportName,
          lastAnalyzed: report.createdAt || null,
          nodes: lineage.nodes.map(n => ({
            id: n.id,
            name: n.name,
            type: n.type === 'PBI_REPORT' ? 'REPORT' :
                  n.type === 'PBI_TABLE' ? 'DATASET' : n.type,
            schema: n.schema || null,
            database: n.database || null,
            server: null,
            hasPk: null,
            sourceType: null,
          })),
          edges: lineage.edges.map(e => ({
            source: e.source,
            target: e.target,
            relationship: e.relationship,
            discoveryMethod: 'REGEX' as const,
          })),
          warnings: [],
        };

        exportData.reports.push({
          id: report.id!,
          reportName: report.reportName,
          reportPath: '',
          lineage: convertedLineage,
          executions: [], // PBI doesn't have execution history
        });

        // Collect proc/view IDs for definitions
        for (const node of lineage.nodes) {
          if (node.type === 'PROC' && node.id) {
            const match = node.id.match(/PROC_(\d+)/);
            if (match) procIds.add(parseInt(match[1], 10));
          }
          if (node.type === 'VIEW' && node.id) {
            const match = node.id.match(/VIEW_(\d+)/);
            if (match) viewIds.add(parseInt(match[1], 10));
          }
        }
      } catch (err) {
        console.warn(`Failed to get lineage for PBI report ${report.reportName}:`, err);
      }
    }

    // Fetch definitions
    for (const procId of procIds) {
      const proc = this.repos.storedProc.findById(procId);
      if (proc && proc.definition) {
        exportData.procDefinitions[`PROC_${procId}`] = proc.definition;
      }
    }

    for (const viewId of viewIds) {
      const view = this.repos.view.findById(viewId);
      if (view && view.definition) {
        exportData.viewDefinitions[`VIEW_${viewId}`] = view.definition;
      }
    }

    return this.generateHtml(exportData, title);
  }

  private generateHtml(data: ExportData, title: string = 'SSRS Report Lineage'): string {
    const jsonData = JSON.stringify(data, null, 2)
      .replace(/</g, '\\u003c')  // Escape for script tag safety
      .replace(/>/g, '\\u003e');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
${this.getCss()}
  </style>
</head>
<body>
  <div id="app">
    <header>
      <h1>${title}</h1>
      <span id="header-info"></span>
    </header>

    <!-- Report List View -->
    <div id="list-view">
      <div class="list-controls">
        <input type="text" id="report-search" placeholder="Search reports..." />
        <span id="report-count"></span>
      </div>
      <div id="report-list"></div>
      <div id="pagination"></div>
    </div>

    <!-- Lineage View (hidden by default) -->
    <div id="lineage-view" class="hidden">
      <div class="lineage-header">
        <button id="back-btn" class="btn-back">&larr; Back to Reports</button>
        <h2 id="report-title"></h2>
      </div>

      <div id="main-content">
        <div id="legend">
          <h3>Legend</h3>
          <div class="legend-items">
            <div class="legend-item"><span class="legend-shape report"></span> Report</div>
            <div class="legend-item"><span class="legend-shape dataset"></span> Dataset</div>
            <div class="legend-item"><span class="legend-shape shared-dataset"></span> Shared Dataset</div>
            <div class="legend-item"><span class="legend-shape proc"></span> Stored Proc</div>
            <div class="legend-item"><span class="legend-shape view"></span> View</div>
            <div class="legend-item"><span class="legend-shape table"></span> Table</div>
            <div class="legend-item"><span class="legend-shape not-found"></span> Not Found</div>
          </div>
          <h4>Discovery Method</h4>
          <div class="legend-items">
            <div class="legend-item"><span class="legend-line both"></span> BOTH (high confidence)</div>
            <div class="legend-item"><span class="legend-line sql-server"></span> SQL Server only</div>
            <div class="legend-item"><span class="legend-line regex"></span> Regex only</div>
            <div class="legend-item"><span class="legend-line dynamic"></span> Dynamic SQL</div>
          </div>
          <h4>In SQL2(D300SQLDW01)</h4>
          <div class="legend-items">
            <div class="legend-item"><span class="table-status ok">Yes</span> Table in metadata</div>
            <div class="legend-item"><span class="table-status not-found">No</span> External/missing</div>
          </div>
        </div>

        <div id="graph-container">
          <svg id="graph"></svg>
        </div>

        <div id="sidebar">
          <div id="source-tables">
            <h3>Source Tables</h3>
            <div id="tables-list"></div>
          </div>
          <div id="executions-section">
            <h3>Recent Executions</h3>
            <div id="executions-list"></div>
          </div>
          <div id="warnings-section">
            <h3>Warnings</h3>
            <div id="warnings-list"></div>
          </div>
        </div>
      </div>
    </div>

    <div id="modal" class="modal hidden">
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="modal-title"></h3>
          <button class="modal-close">&times;</button>
        </div>
        <pre id="modal-body"></pre>
      </div>
    </div>
  </div>

  <script>
    const LINEAGE_DATA = ${jsonData};
  </script>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <script>
${this.getJs()}
  </script>
</body>
</html>`;
  }

  private getCss(): string {
    return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: #f5f5f5;
      color: #333;
    }

    #app {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    header {
      background: #1976d2;
      color: white;
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    header h1 {
      font-size: 1.4rem;
      font-weight: 500;
    }

    #header-info {
      font-size: 0.9rem;
      opacity: 0.9;
    }

    /* List View */
    #list-view {
      padding: 20px 40px;
      width: 100%;
      flex: 1;
    }

    .list-controls {
      display: flex;
      align-items: center;
      gap: 20px;
      margin-bottom: 24px;
      padding: 16px 20px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    #report-search {
      padding: 12px 20px;
      font-size: 1.05rem;
      border: 1px solid #ddd;
      border-radius: 6px;
      width: 400px;
    }

    #report-search:focus {
      outline: none;
      border-color: #1976d2;
      box-shadow: 0 0 0 2px rgba(25,118,210,0.2);
    }

    #report-count {
      font-size: 0.9rem;
      color: #666;
    }

    #report-list {
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      overflow: hidden;
    }

    .report-row {
      display: flex;
      align-items: center;
      padding: 16px 24px;
      border-bottom: 1px solid #eee;
      cursor: pointer;
      transition: background 0.15s;
    }

    .report-row:last-child {
      border-bottom: none;
    }

    .report-row:hover {
      background: #f5f9ff;
    }

    .report-row .report-name {
      flex: 1;
      font-size: 1rem;
    }

    .report-row .report-name .match {
      background: #fff59d;
      padding: 1px 2px;
      border-radius: 2px;
    }

    .report-row .view-btn {
      padding: 8px 20px;
      background: #1976d2;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    }

    .report-row .view-btn:hover {
      background: #1565c0;
    }

    #pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 10px;
      margin-top: 24px;
      padding: 20px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .page-btn {
      padding: 10px 18px;
      border: 1px solid #ddd;
      background: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 1rem;
      font-weight: 500;
      transition: all 0.15s;
    }

    .page-btn:hover:not(:disabled) {
      background: #f0f0f0;
      border-color: #1976d2;
    }

    .page-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .page-btn.active {
      background: #1976d2;
      color: white;
      border-color: #1976d2;
    }

    .page-info {
      margin: 0 16px;
      color: #333;
      font-size: 1rem;
      font-weight: 500;
    }

    /* View visibility */
    .hidden {
      display: none !important;
    }

    .lineage-header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
      background: white;
      border-bottom: 1px solid #e0e0e0;
    }

    .btn-back {
      padding: 8px 16px;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.9rem;
      transition: all 0.15s;
    }

    .btn-back:hover {
      background: #e0e0e0;
    }

    #report-title {
      margin: 0;
      font-size: 1.2rem;
      font-weight: 500;
      color: #333;
    }

    #main-content {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    #legend {
      width: 200px;
      background: white;
      padding: 15px;
      border-right: 1px solid #e0e0e0;
      overflow-y: auto;
    }

    #legend h3, #legend h4 {
      font-size: 0.85rem;
      margin-bottom: 10px;
      color: #555;
    }

    #legend h4 {
      margin-top: 15px;
    }

    .legend-items {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.8rem;
    }

    .legend-shape {
      width: 16px;
      height: 16px;
      border-radius: 3px;
    }

    .legend-shape.report { background: #4CAF50; }
    .legend-shape.dataset { background: #2196F3; }
    .legend-shape.shared-dataset { background: #00BCD4; }
    .legend-shape.proc { background: #FF9800; }
    .legend-shape.view { background: #9C27B0; }
    .legend-shape.table { background: #F44336; }
    .legend-shape.not-found { background: #c62828; border: 2px dashed #fff; }

    .legend-line {
      width: 30px;
      height: 3px;
      border-radius: 2px;
    }

    .legend-line.both { background: #4CAF50; }
    .legend-line.sql-server { background: #2196F3; }
    .legend-line.regex { background: #666; }
    .legend-line.dynamic { background: #FF9800; }

    #graph-container {
      flex: 1;
      background: #fafafa;
      position: relative;
    }

    #graph {
      width: 100%;
      height: 100%;
    }

    #sidebar {
      width: 280px;
      background: white;
      border-left: 1px solid #e0e0e0;
      overflow-y: auto;
      padding: 15px;
    }

    #sidebar h3 {
      font-size: 0.9rem;
      color: #555;
      margin-bottom: 10px;
      padding-bottom: 5px;
      border-bottom: 1px solid #eee;
    }

    #tables-list, #warnings-list, #executions-list {
      font-size: 0.8rem;
    }

    .table-item {
      padding: 6px 0;
      border-bottom: 1px solid #f0f0f0;
    }

    .table-name {
      font-weight: 500;
    }

    .table-meta {
      color: #666;
      font-size: 0.75rem;
      margin-top: 2px;
    }

    .table-status {
      display: inline-block;
      font-size: 0.7rem;
      padding: 1px 4px;
      border-radius: 3px;
      margin-left: 5px;
    }

    .table-status.ok { background: #e8f5e9; color: #2e7d32; }
    .table-status.not-found { background: #ffebee; color: #c62828; }

    .warning-item {
      padding: 6px 0;
      border-bottom: 1px solid #f0f0f0;
      color: #f57c00;
    }

    #warnings-section {
      margin-top: 20px;
    }

    #executions-section {
      margin-top: 20px;
    }

    .execution-item {
      padding: 8px 0;
      border-bottom: 1px solid #f0f0f0;
    }

    .execution-time {
      font-family: monospace;
      font-size: 0.75rem;
      color: #666;
    }

    .execution-status {
      display: inline-block;
      font-size: 0.65rem;
      padding: 2px 6px;
      border-radius: 3px;
      margin-left: 6px;
    }

    .execution-status.success { background: #e8f5e9; color: #2e7d32; }
    .execution-status.error { background: #ffebee; color: #c62828; }

    .execution-type {
      display: inline-block;
      font-size: 0.65rem;
      padding: 2px 6px;
      border-radius: 3px;
      margin-left: 4px;
    }

    .execution-type.interactive { background: #e3f2fd; color: #1565c0; }
    .execution-type.subscription { background: #fff3e0; color: #e65100; }

    .execution-params {
      margin-top: 4px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      max-height: 100px;
      overflow-y: auto;
    }

    .execution-params .param-item {
      display: flex;
      gap: 6px;
      font-size: 0.7rem;
      padding: 3px 6px;
      background: #f8f9fa;
      border-radius: 3px;
      border-left: 2px solid #4CAF50;
    }

    .execution-params .param-name {
      font-weight: 600;
      color: #1565c0;
      min-width: 80px;
      flex-shrink: 0;
    }

    .execution-params .param-name::after {
      content: ':';
    }

    .execution-params .param-value {
      color: #333;
      word-break: break-word;
    }

    .no-executions {
      color: #999;
      font-style: italic;
      padding: 10px 0;
    }

    .modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal.hidden {
      display: none;
    }

    .modal-content {
      background: white;
      border-radius: 8px;
      width: 80%;
      max-width: 900px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 20px;
      border-bottom: 1px solid #e0e0e0;
    }

    .modal-header h3 {
      font-size: 1rem;
      font-weight: 500;
    }

    .modal-close {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: #666;
      padding: 0 5px;
    }

    .modal-close:hover {
      color: #333;
    }

    #modal-body {
      padding: 20px;
      overflow: auto;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 0.85rem;
      background: #f8f8f8;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .node text {
      font-size: 10px;
      fill: #333;
      pointer-events: none;
    }

    .link-path {
      fill: none;
    }
    `;
  }

  private getJs(): string {
    return `
(function() {
  // Node type configurations
  const NODE_CONFIG = {
    REPORT: { color: '#4CAF50', shape: 'roundedRect', label: 'Report' },
    DATASET: { color: '#2196F3', shape: 'ellipse', label: 'Dataset' },
    SHARED_DATASET: { color: '#00BCD4', shape: 'ellipse', label: 'Shared Dataset' },
    PROC: { color: '#FF9800', shape: 'diamond', label: 'Stored Proc' },
    VIEW: { color: '#9C27B0', shape: 'hexagon', label: 'View' },
    TABLE: { color: '#F44336', shape: 'circle', label: 'Table' },
    PROC_NOT_FOUND: { color: '#c62828', shape: 'diamond', label: 'Proc (Not Found)', dashed: true },
    SHARED_DATASET_NOT_FOUND: { color: '#c62828', shape: 'ellipse', label: 'Shared Dataset (Not Found)', dashed: true },
    TABLE_NOT_FOUND: { color: '#c62828', shape: 'circle', label: 'Table (Not Found)', dashed: true },
    VIEW_NOT_FOUND: { color: '#c62828', shape: 'hexagon', label: 'View (Not Found)', dashed: true },
    LINKED_SERVER_UNKNOWN: { color: '#c62828', shape: 'circle', label: 'Linked Server (Unknown)', dashed: true }
  };

  const TYPE_ORDER = ['REPORT', 'DATASET', 'SHARED_DATASET', 'PROC', 'VIEW', 'TABLE'];

  const getBaseType = (type) => {
    const typeMap = {
      'PROC_NOT_FOUND': 'PROC',
      'SHARED_DATASET_NOT_FOUND': 'SHARED_DATASET',
      'TABLE_NOT_FOUND': 'TABLE',
      'VIEW_NOT_FOUND': 'VIEW',
      'LINKED_SERVER_UNKNOWN': 'TABLE'
    };
    return typeMap[type] || type;
  };

  function drawShape(shape, size) {
    const s = size;
    switch (shape) {
      case 'circle':
        return d3.arc()({
          innerRadius: 0,
          outerRadius: s,
          startAngle: 0,
          endAngle: 2 * Math.PI
        });
      case 'diamond':
        return 'M 0 ' + (-s) + ' L ' + s + ' 0 L 0 ' + s + ' L ' + (-s) + ' 0 Z';
      case 'hexagon':
        const h = s * 0.866;
        return 'M ' + (-s) + ' 0 L ' + (-s/2) + ' ' + (-h) + ' L ' + (s/2) + ' ' + (-h) + ' L ' + s + ' 0 L ' + (s/2) + ' ' + h + ' L ' + (-s/2) + ' ' + h + ' Z';
      case 'ellipse':
        return 'M ' + (-s * 1.3) + ' 0 A ' + (s * 1.3) + ' ' + (s * 0.8) + ' 0 1 1 ' + (s * 1.3) + ' 0 A ' + (s * 1.3) + ' ' + (s * 0.8) + ' 0 1 1 ' + (-s * 1.3) + ' 0';
      case 'roundedRect':
        const w = s * 1.5;
        const h2 = s * 0.8;
        const r = 5;
        return 'M ' + (-w + r) + ' ' + (-h2) + ' L ' + (w - r) + ' ' + (-h2) + ' Q ' + w + ' ' + (-h2) + ' ' + w + ' ' + (-h2 + r) + ' L ' + w + ' ' + (h2 - r) + ' Q ' + w + ' ' + h2 + ' ' + (w - r) + ' ' + h2 + ' L ' + (-w + r) + ' ' + h2 + ' Q ' + (-w) + ' ' + h2 + ' ' + (-w) + ' ' + (h2 - r) + ' L ' + (-w) + ' ' + (-h2 + r) + ' Q ' + (-w) + ' ' + (-h2) + ' ' + (-w + r) + ' ' + (-h2) + ' Z';
      default:
        return d3.arc()({
          innerRadius: 0,
          outerRadius: s,
          startAngle: 0,
          endAngle: 2 * Math.PI
        });
    }
  }

  function getCurvedPath(source, target) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dr = Math.sqrt(dx * dx + dy * dy);
    const sameType = getBaseType(source.type) === getBaseType(target.type);
    const curveAmount = sameType ? dr * 0.3 : dr * 0.1;
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    const perpX = -dy / dr * curveAmount;
    const perpY = dx / dr * curveAmount;
    const ctrlX = midX + perpX;
    const ctrlY = midY + perpY;
    return 'M ' + source.x + ' ' + source.y + ' Q ' + ctrlX + ' ' + ctrlY + ' ' + target.x + ' ' + target.y;
  }

  let currentSimulation = null;

  function renderGraph(lineageData) {
    if (currentSimulation) {
      currentSimulation.stop();
    }

    const svg = d3.select('#graph');
    svg.selectAll('*').remove();

    if (!lineageData || !lineageData.nodes || lineageData.nodes.length === 0) {
      svg.append('text')
        .attr('x', '50%')
        .attr('y', '50%')
        .attr('text-anchor', 'middle')
        .attr('fill', '#666')
        .text('No lineage data for this report');
      return;
    }

    const container = document.getElementById('graph-container');
    const width = container.clientWidth || 900;
    const height = container.clientHeight || 600;
    const margin = { top: 60, right: 40, bottom: 40, left: 40 };

    svg.attr('viewBox', [0, 0, width, height]);

    const nodesByType = {};
    lineageData.nodes.forEach(node => {
      const baseType = getBaseType(node.type);
      if (!nodesByType[baseType]) nodesByType[baseType] = [];
      nodesByType[baseType].push(node);
    });

    const layerWidth = (width - margin.left - margin.right) / TYPE_ORDER.length;
    const nodes = lineageData.nodes.map(node => {
      const baseType = getBaseType(node.type);
      const layerIndex = TYPE_ORDER.indexOf(baseType);
      const nodesInLayer = nodesByType[baseType] || [];
      const indexInLayer = nodesInLayer.indexOf(node);
      const layerHeight = height - margin.top - margin.bottom;
      const spacing = layerHeight / (nodesInLayer.length + 1);
      return {
        ...node,
        x: margin.left + (layerIndex >= 0 ? layerIndex : 3) * layerWidth + layerWidth / 2,
        y: margin.top + (indexInLayer + 1) * spacing
      };
    });

    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const links = lineageData.edges
      .map(e => ({
        source: nodeById.get(e.source),
        target: nodeById.get(e.target),
        relationship: e.relationship,
        discoveryMethod: e.discoveryMethod
      }))
      .filter(l => l.source && l.target);

    const g = svg.append('g');

    const zoom = d3.zoom()
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoom);

    const defs = svg.append('defs');
    const markerColors = {
      'default': '#666',
      'BOTH': '#4CAF50',
      'SQL_SERVER': '#2196F3',
      'REGEX': '#999',
      'DYNAMIC': '#FF9800',
      'highlight': '#FFD700'
    };

    Object.entries(markerColors).forEach(([key, color]) => {
      defs.append('marker')
        .attr('id', 'arrow-' + key)
        .attr('viewBox', '-0 -5 10 10')
        .attr('refX', 25)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 8)
        .attr('markerHeight', 8)
        .append('path')
        .attr('d', 'M 0,-5 L 10,0 L 0,5')
        .attr('fill', color);
    });

    const discoveryColors = {
      'BOTH': '#4CAF50',
      'SQL_SERVER': '#2196F3',
      'REGEX': '#666',
      'DYNAMIC': '#FF9800'
    };

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(100).strength(0.7))
      .force('charge', d3.forceManyBody().strength(-500))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50))
      .force('x', d3.forceX(d => {
        const baseType = getBaseType(d.type);
        const layerIndex = TYPE_ORDER.indexOf(baseType);
        return margin.left + (layerIndex >= 0 ? layerIndex : 3) * layerWidth + layerWidth / 2;
      }).strength(0.3))
      .force('y', d3.forceY(height / 2).strength(0.02));

    currentSimulation = simulation;

    const linkGroup = g.append('g').attr('class', 'links');
    const link = linkGroup.selectAll('path')
      .data(links)
      .enter()
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', d => discoveryColors[d.discoveryMethod] || '#666')
      .attr('stroke-width', d => d.discoveryMethod === 'BOTH' ? 3 : 2)
      .attr('stroke-opacity', 0.8)
      .attr('marker-end', d => 'url(#arrow-' + (d.discoveryMethod || 'default') + ')')
      .attr('class', 'link-path');

    link.append('title')
      .text(d => {
        const methodLabel = {
          'BOTH': 'Found by BOTH SQL Server & Regex (High Confidence)',
          'SQL_SERVER': 'Found by SQL Server only',
          'REGEX': 'Found by Regex only',
          'DYNAMIC': 'Dynamic SQL reference'
        };
        return d.source.name + ' -> ' + d.target.name + '\\n' + d.relationship + '\\n' + (methodLabel[d.discoveryMethod] || d.discoveryMethod);
      });

    const nodeGroup = g.append('g').attr('class', 'nodes');
    const node = nodeGroup.selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    const clickableTypes = ['PROC', 'VIEW', 'SHARED_DATASET'];

    node.append('path')
      .attr('d', d => {
        const config = NODE_CONFIG[d.type] || NODE_CONFIG.TABLE;
        return drawShape(config.shape, 20);
      })
      .attr('fill', d => {
        const config = NODE_CONFIG[d.type] || NODE_CONFIG.TABLE;
        return config.color;
      })
      .attr('stroke', d => {
        const config = NODE_CONFIG[d.type] || NODE_CONFIG.TABLE;
        return config.dashed ? '#c62828' : '#fff';
      })
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', d => {
        const config = NODE_CONFIG[d.type] || NODE_CONFIG.TABLE;
        return config.dashed ? '5,3' : 'none';
      })
      .attr('cursor', d => clickableTypes.includes(d.type) ? 'pointer' : 'default')
      .on('click', (event, d) => {
        if (clickableTypes.includes(d.type)) {
          showDefinition(d);
        }
      })
      .on('mouseover', function(event, d) {
        d3.select(this).attr('stroke', '#FFD700').attr('stroke-width', 3);
        link.each(function(l) {
          if (l.source.id === d.id || l.target.id === d.id) {
            d3.select(this)
              .attr('stroke', '#FFD700')
              .attr('stroke-width', 4)
              .attr('stroke-opacity', 1)
              .attr('marker-end', 'url(#arrow-highlight)');
          } else {
            d3.select(this).attr('stroke-opacity', 0.2);
          }
        });
        node.each(function(n) {
          const connected = links.some(l =>
            (l.source.id === d.id && l.target.id === n.id) ||
            (l.target.id === d.id && l.source.id === n.id)
          );
          if (!connected && n.id !== d.id) {
            d3.select(this).attr('opacity', 0.3);
          }
        });
      })
      .on('mouseout', function(event, d) {
        const config = NODE_CONFIG[d.type] || NODE_CONFIG.TABLE;
        d3.select(this)
          .attr('stroke', config.dashed ? '#c62828' : '#fff')
          .attr('stroke-width', 2);
        link.each(function(l) {
          d3.select(this)
            .attr('stroke', discoveryColors[l.discoveryMethod] || '#666')
            .attr('stroke-width', l.discoveryMethod === 'BOTH' ? 3 : 2)
            .attr('stroke-opacity', 0.8)
            .attr('marker-end', 'url(#arrow-' + (l.discoveryMethod || 'default') + ')');
        });
        node.attr('opacity', 1);
      });

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 35)
      .attr('font-size', '10px')
      .attr('fill', '#333')
      .attr('pointer-events', 'none')
      .text(d => {
        const name = d.name || '';
        return name.length > 18 ? name.substring(0, 15) + '...' : name;
      });

    node.append('title')
      .text(d => {
        const config = NODE_CONFIG[d.type] || NODE_CONFIG.TABLE;
        let tooltip = config.label + ': ' + d.name;
        if (d.server) tooltip += '\\nServer: ' + d.server;
        if (d.database) tooltip += '\\nDatabase: ' + d.database;
        if (config.dashed) tooltip += '\\n! NOT FOUND - Missing from metadata';
        return tooltip;
      });

    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    simulation.on('tick', () => {
      link.attr('d', d => getCurvedPath(d.source, d.target));
      node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
    });
  }

  function showDefinition(node) {
    let definition = '';
    let title = '';

    if (node.type === 'PROC') {
      title = 'Stored Procedure: ' + node.name;
      definition = LINEAGE_DATA.procDefinitions[node.id] || 'Definition not found';
    } else if (node.type === 'VIEW') {
      title = 'View: ' + node.name;
      definition = LINEAGE_DATA.viewDefinitions[node.id] || 'Definition not found';
    } else if (node.type === 'SHARED_DATASET') {
      title = 'Shared Dataset: ' + node.name;
      definition = LINEAGE_DATA.sharedDatasetDefinitions[node.id] || 'Definition not found';
    }

    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').textContent = definition;
    document.getElementById('modal').classList.remove('hidden');
  }

  function renderSourceTables(lineageData) {
    const container = document.getElementById('tables-list');
    container.innerHTML = '';

    if (!lineageData || !lineageData.nodes) {
      container.innerHTML = '<div class="table-item">No data</div>';
      return;
    }

    const tableNodes = lineageData.nodes.filter(n =>
      n.type === 'TABLE' || n.type === 'TABLE_NOT_FOUND'
    );

    if (tableNodes.length === 0) {
      container.innerHTML = '<div class="table-item">No source tables</div>';
      return;
    }

    tableNodes.forEach(node => {
      const div = document.createElement('div');
      div.className = 'table-item';

      const isNotFound = node.type === 'TABLE_NOT_FOUND';
      const statusClass = isNotFound ? 'not-found' : 'ok';
      const statusText = isNotFound ? 'No' : 'Yes';

      div.innerHTML =
        '<div class="table-name">' + (node.name || 'Unknown') +
        '<span class="table-status ' + statusClass + '">' + statusText + '</span></div>' +
        '<div class="table-meta">' +
        (node.schema ? 'Schema: ' + node.schema : '') +
        (node.database ? ' | DB: ' + node.database : '') +
        (node.server ? ' | Server: ' + node.server : '') +
        '</div>';

      container.appendChild(div);
    });
  }

  function renderWarnings(lineageData) {
    const container = document.getElementById('warnings-list');
    container.innerHTML = '';

    if (!lineageData || !lineageData.warnings || lineageData.warnings.length === 0) {
      container.innerHTML = '<div class="warning-item" style="color: #4CAF50;">No warnings</div>';
      return;
    }

    lineageData.warnings.forEach(warning => {
      const div = document.createElement('div');
      div.className = 'warning-item';
      div.textContent = warning.entityType + ' ' + warning.entityName + ': ' + warning.warning;
      container.appendChild(div);
    });
  }

  function renderExecutions(executions) {
    const container = document.getElementById('executions-list');
    container.innerHTML = '';

    if (!executions || executions.length === 0) {
      container.innerHTML = '<div class="no-executions">No execution history</div>';
      return;
    }

    executions.forEach(exec => {
      const div = document.createElement('div');
      div.className = 'execution-item';

      const isSuccess = exec.status === 'rsSuccess';
      const statusClass = isSuccess ? 'success' : 'error';
      const statusText = isSuccess ? 'Success' : (exec.status || 'Unknown');

      const typeClass = (exec.requestType || '').toLowerCase();

      let html = '<div class="execution-time">' + (exec.executedAt || 'Unknown time') +
        '<span class="execution-status ' + statusClass + '">' + statusText + '</span>';

      if (exec.requestType) {
        html += '<span class="execution-type ' + typeClass + '">' + exec.requestType + '</span>';
      }
      html += '</div>';

      if (exec.parameters) {
        html += '<div class="execution-params">';
        try {
          var params = exec.parameters.split('&');
          params.forEach(function(pair) {
            var parts = pair.split('=');
            var name = decodeURIComponent(parts[0] || '');
            var value = decodeURIComponent(parts.slice(1).join('=') || '').replace(/\\+/g, ' ');
            if (name) {
              html += '<div class="param-item"><span class="param-name">' + name + '</span><span class="param-value">' + value + '</span></div>';
            }
          });
        } catch (e) {
          html += exec.parameters;
        }
        html += '</div>';
      }

      div.innerHTML = html;
      container.appendChild(div);
    });
  }

  function init() {
    const listView = document.getElementById('list-view');
    const lineageView = document.getElementById('lineage-view');
    const searchInput = document.getElementById('report-search');
    const reportList = document.getElementById('report-list');
    const pagination = document.getElementById('pagination');
    const countSpan = document.getElementById('report-count');
    const headerInfo = document.getElementById('header-info');
    const backBtn = document.getElementById('back-btn');
    const reportTitle = document.getElementById('report-title');

    if (!LINEAGE_DATA.reports || LINEAGE_DATA.reports.length === 0) {
      headerInfo.textContent = 'No reports available';
      reportList.innerHTML = '<div style="padding:40px;text-align:center;color:#666;">No reports found</div>';
      return;
    }

    const PAGE_SIZE = 25;
    let currentPage = 1;
    let filteredReports = LINEAGE_DATA.reports.map((r, i) => ({ ...r, originalIndex: i }));

    headerInfo.textContent = LINEAGE_DATA.reports.length + ' reports';

    // Highlight matching text
    function highlightMatch(text, term) {
      if (!term) return text;
      var escaped = term.replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, '\\\\$&');
      var regex = new RegExp('(' + escaped + ')', 'gi');
      return text.replace(regex, '<span class="match">$1</span>');
    }

    // Render the report list
    function renderList() {
      const totalPages = Math.ceil(filteredReports.length / PAGE_SIZE);
      const startIdx = (currentPage - 1) * PAGE_SIZE;
      const pageReports = filteredReports.slice(startIdx, startIdx + PAGE_SIZE);
      const searchTerm = searchInput.value.trim();

      // Update count
      if (searchTerm) {
        countSpan.textContent = filteredReports.length + ' of ' + LINEAGE_DATA.reports.length + ' reports';
      } else {
        countSpan.textContent = LINEAGE_DATA.reports.length + ' reports';
      }

      // Render rows
      reportList.innerHTML = '';
      if (pageReports.length === 0) {
        reportList.innerHTML = '<div style="padding:40px;text-align:center;color:#666;">No reports match your search</div>';
      } else {
        pageReports.forEach(report => {
          const row = document.createElement('div');
          row.className = 'report-row';
          row.innerHTML = '<span class="report-name">' + highlightMatch(report.reportName, searchTerm) + '</span>' +
                          '<button class="view-btn">View Lineage</button>';
          row.querySelector('.view-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            showLineage(report.originalIndex);
          });
          row.addEventListener('click', () => showLineage(report.originalIndex));
          reportList.appendChild(row);
        });
      }

      // Render pagination
      renderPagination(totalPages);
    }

    // Render pagination controls
    function renderPagination(totalPages) {
      pagination.innerHTML = '';
      if (totalPages <= 1) return;

      // First & Prev
      var firstBtn = document.createElement('button');
      firstBtn.className = 'page-btn';
      firstBtn.textContent = 'First';
      firstBtn.disabled = currentPage === 1;
      firstBtn.addEventListener('click', () => { currentPage = 1; renderList(); });
      pagination.appendChild(firstBtn);

      var prevBtn = document.createElement('button');
      prevBtn.className = 'page-btn';
      prevBtn.textContent = 'Prev';
      prevBtn.disabled = currentPage === 1;
      prevBtn.addEventListener('click', () => { currentPage--; renderList(); });
      pagination.appendChild(prevBtn);

      // Page numbers
      var startPage = Math.max(1, currentPage - 2);
      var endPage = Math.min(totalPages, startPage + 4);
      if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

      for (var p = startPage; p <= endPage; p++) {
        var pageBtn = document.createElement('button');
        pageBtn.className = 'page-btn' + (p === currentPage ? ' active' : '');
        pageBtn.textContent = p;
        pageBtn.dataset.page = p;
        pageBtn.addEventListener('click', function() {
          currentPage = parseInt(this.dataset.page, 10);
          renderList();
        });
        pagination.appendChild(pageBtn);
      }

      // Next & Last
      var nextBtn = document.createElement('button');
      nextBtn.className = 'page-btn';
      nextBtn.textContent = 'Next';
      nextBtn.disabled = currentPage === totalPages;
      nextBtn.addEventListener('click', () => { currentPage++; renderList(); });
      pagination.appendChild(nextBtn);

      var lastBtn = document.createElement('button');
      lastBtn.className = 'page-btn';
      lastBtn.textContent = 'Last';
      lastBtn.disabled = currentPage === totalPages;
      lastBtn.addEventListener('click', () => { currentPage = totalPages; renderList(); });
      pagination.appendChild(lastBtn);

      // Page info
      var info = document.createElement('span');
      info.className = 'page-info';
      info.textContent = 'Page ' + currentPage + ' of ' + totalPages;
      pagination.appendChild(info);
    }

    // Show lineage for a report
    function showLineage(index) {
      const report = LINEAGE_DATA.reports[index];
      if (!report) return;

      reportTitle.textContent = report.reportName;
      listView.classList.add('hidden');
      lineageView.classList.remove('hidden');

      renderGraph(report.lineage);
      renderSourceTables(report.lineage);
      renderExecutions(report.executions);
      renderWarnings(report.lineage);
    }

    // Back to list
    function showList() {
      lineageView.classList.add('hidden');
      listView.classList.remove('hidden');
    }

    // Filter reports
    function filterReports(term) {
      if (!term) {
        return LINEAGE_DATA.reports.map((r, i) => ({ ...r, originalIndex: i }));
      }
      const lower = term.toLowerCase();
      return LINEAGE_DATA.reports
        .map((r, i) => ({ ...r, originalIndex: i }))
        .filter(r => r.reportName.toLowerCase().includes(lower));
    }

    // Search handler
    searchInput.addEventListener('input', () => {
      const term = searchInput.value.trim();
      filteredReports = filterReports(term);
      currentPage = 1;
      renderList();
    });

    // Back button
    backBtn.addEventListener('click', showList);

    // Modal close handlers
    document.querySelector('.modal-close').addEventListener('click', () => {
      document.getElementById('modal').classList.add('hidden');
    });
    document.getElementById('modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal') {
        document.getElementById('modal').classList.add('hidden');
      }
    });

    // Initial render
    renderList();
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;
  }
}
