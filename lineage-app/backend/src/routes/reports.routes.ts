import { FastifyInstance } from 'fastify';
import { Services } from '../services/index.js';
import { Repositories } from '../repositories/index.js';
import dayjs from 'dayjs';

export async function reportsRoutes(app: FastifyInstance, services: Services, repos: Repositories) {
  // GET /api/reports
  app.get('/', async () => {
    const reports = repos.report.findAll();

    return reports
      .filter(r => r.status === 'COMPLETED')
      .map(r => ({
        id: r.id,
        fileName: r.fileName,
        reportName: r.reportName || r.fileName,
        source: r.source || 'FILES',
        starred: r.starred,
        lastRunAt: r.lastRunAt ? dayjs(r.lastRunAt).format('MMM D, YYYY h:mm A') : '',
      }));
  });

  // POST /api/reports/:id/star - Toggle star status
  app.post('/:id/star', async (request, reply) => {
    const { id } = request.params as { id: string };
    const report = repos.report.findById(parseInt(id, 10));

    if (!report) {
      reply.status(404);
      return { error: 'Report not found' };
    }

    const newStarred = repos.report.toggleStar(parseInt(id, 10));
    return { id: parseInt(id, 10), starred: newStarred };
  });

  // GET /api/reports/starred - Get all starred reports
  app.get('/starred', async (request) => {
    const { source } = request.query as { source?: string };
    const rdlSource = source === 'DATABASE' ? 'DATABASE' : source === 'FILES' ? 'FILES' : undefined;
    const reports = repos.report.findStarred(rdlSource);

    return reports
      .filter(r => r.status === 'COMPLETED')
      .map(r => ({
        id: r.id,
        fileName: r.fileName,
        reportName: r.reportName || r.fileName,
        source: r.source || 'FILES',
        starred: r.starred,
        lastRunAt: r.lastRunAt ? dayjs(r.lastRunAt).format('MMM D, YYYY h:mm A') : '',
      }));
  });

  // GET /api/reports/starred/count - Get count of starred reports
  app.get('/starred/count', async (request) => {
    const { source } = request.query as { source?: string };
    const rdlSource = source === 'DATABASE' ? 'DATABASE' : source === 'FILES' ? 'FILES' : undefined;
    return { count: repos.report.countStarred(rdlSource) };
  });

  // GET /api/reports/starred/export-csv - Export only starred reports to CSV
  app.get('/starred/export-csv', async (request, reply) => {
    // Get starred template reports
    const starredReports = repos.report.findStarred();
    const completedStarred = starredReports.filter(r => r.status === 'COMPLETED');
    const reportIds = new Set(completedStarred.map(r => r.id!));

    // Get starred linked reports and find their templates
    const starredLinked = repos.linkedReport.findStarred();
    for (const linked of starredLinked) {
      // Find the template report by matching the path
      const allReports = repos.report.findAll();
      const template = allReports.find(r =>
        r.status === 'COMPLETED' &&
        (r.filePath === linked.templatePath ||
         r.filePath.endsWith(linked.templatePath) ||
         linked.templatePath.endsWith(r.filePath))
      );
      if (template && template.id) {
        reportIds.add(template.id);
      }
    }

    if (reportIds.size === 0) {
      reply.status(404);
      return { error: 'No starred reports found' };
    }

    const csv = services.lineage.exportStarredLineageToCsv(Array.from(reportIds));

    reply.header('Content-Disposition', 'attachment; filename="lineage_starred_reports.csv"');
    reply.type('text/csv');
    return csv;
  });

  // GET /api/reports/starred/export-html - Export only starred reports to HTML
  app.get('/starred/export-html', async (request, reply) => {
    // Get starred template reports
    const starredReports = repos.report.findStarred();
    const completedStarred = starredReports.filter(r => r.status === 'COMPLETED');
    const reportIds = new Set(completedStarred.map(r => r.id!));

    // Get starred linked reports and find their templates
    const starredLinked = repos.linkedReport.findStarred();
    for (const linked of starredLinked) {
      // Find the template report by matching the path
      const allReports = repos.report.findAll();
      const template = allReports.find(r =>
        r.status === 'COMPLETED' &&
        (r.filePath === linked.templatePath ||
         r.filePath.endsWith(linked.templatePath) ||
         linked.templatePath.endsWith(r.filePath))
      );
      if (template && template.id) {
        reportIds.add(template.id);
      }
    }

    if (reportIds.size === 0) {
      reply.status(404);
      return { error: 'No starred reports found' };
    }

    const html = services.htmlExport.exportStarredAsHtml(Array.from(reportIds));

    reply.header('Content-Disposition', 'attachment; filename="lineage_starred_reports.html"');
    reply.type('text/html');
    return html;
  });

  // GET /api/reports/:id
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const report = repos.report.findById(parseInt(id, 10));

    if (!report) {
      reply.status(404);
      return { error: 'Report not found' };
    }

    return {
      id: report.id,
      fileName: report.fileName,
      filePath: report.filePath,
      reportName: report.reportName || report.fileName,
      source: report.source || 'FILES',
      status: report.status,
      lastRunAt: report.lastRunAt ? dayjs(report.lastRunAt).format('MMM D, YYYY h:mm A') : '',
      errorMessage: report.errorMessage || '',
    };
  });

  // GET /api/reports/:id/lineage
  app.get('/:id/lineage', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      return services.lineage.getLineageGraph(parseInt(id, 10));
    } catch (error) {
      reply.status(404);
      return { error: 'Report not found' };
    }
  });

  // GET /api/reports/:id/tables
  app.get('/:id/tables', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      return services.lineage.getSourceTables(parseInt(id, 10));
    } catch (error) {
      reply.status(404);
      return { error: 'Report not found' };
    }
  });

  // GET /api/reports/:id/datasources
  app.get('/:id/datasources', async (request) => {
    const { id } = request.params as { id: string };
    const sources = repos.dataSource.findByReportId(parseInt(id, 10));

    return sources.map(ds => {
      // Look up metadata from shared_data_sources table using reference path
      let metadataServer: string | null = null;
      let metadataDatabase: string | null = null;

      if (ds.referencePath) {
        const sharedDs = repos.sharedDataSource.findByPath(ds.referencePath);
        if (sharedDs) {
          metadataServer = sharedDs.server;
          metadataDatabase = sharedDs.databaseName;
        }
      }

      return {
        id: ds.id,
        sourceName: ds.sourceName,
        sourceType: ds.sourceType,
        referencePath: ds.referencePath,
        // From XML
        xmlServer: ds.server,
        xmlDatabase: ds.databaseName,
        // From Metadata
        metadataServer,
        metadataDatabase,
      };
    });
  });

  // GET /api/reports/procs/:id
  app.get('/procs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name } = request.query as { name?: string };

    let proc = null;

    if (name) {
      proc = repos.storedProc.findByName(name);
    }

    if (!proc) {
      proc = repos.storedProc.findById(parseInt(id, 10));
    }

    if (!proc) {
      console.warn(`Stored procedure not found: id=${id}, name=${name}`);
      reply.status(404);
      return { error: 'Stored procedure not found' };
    }

    return {
      id: proc.id,
      schemaName: proc.schemaName,
      procName: proc.procName,
      fullName: `${proc.schemaName}.${proc.procName}`,
      definition: proc.definition || '',
    };
  });

  // GET /api/reports/views/:id
  app.get('/views/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name } = request.query as { name?: string };

    let view = null;

    if (name) {
      view = repos.view.findByName(name);
    }

    if (!view) {
      view = repos.view.findById(parseInt(id, 10));
    }

    if (!view) {
      console.warn(`View not found: id=${id}, name=${name}`);
      reply.status(404);
      return { error: 'View not found' };
    }

    return {
      id: view.id,
      schemaName: view.schemaName,
      viewName: view.viewName,
      fullName: `${view.schemaName}.${view.viewName}`,
      definition: view.definition || '',
    };
  });

  // GET /api/reports/shared-datasets/:id
  app.get('/shared-datasets/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name } = request.query as { name?: string };

    let sd = null;

    if (name) {
      sd = repos.sharedDataset.findByName(name);
    }

    if (!sd && parseInt(id, 10) > 0) {
      sd = repos.sharedDataset.findById(parseInt(id, 10));
    }

    if (!sd) {
      console.warn(`SharedDataset not found: id=${id}, name=${name}`);
      reply.status(404);
      return { error: 'SharedDataset not found' };
    }

    return {
      id: sd.id,
      datasetName: sd.datasetName,
      datasetPath: sd.datasetPath || '',
      commandType: sd.commandType || '',
      definition: sd.commandText || '',
    };
  });

  // GET /api/reports/:id/export
  app.get('/:id/export', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const csv = services.lineage.exportLineageToCsv(parseInt(id, 10));
      const report = repos.report.findById(parseInt(id, 10));
      const fileName = report?.reportName?.replace(/[^a-zA-Z0-9]/g, '_') || `report_${id}`;

      reply.header('Content-Disposition', `attachment; filename="lineage_${fileName}.csv"`);
      reply.type('text/csv');
      return csv;
    } catch (error) {
      reply.status(404);
      return { error: 'Report not found' };
    }
  });

  // GET /api/reports/export-all
  app.get('/export-all', async (request, reply) => {
    const csv = services.lineage.exportAllLineageToCsv();

    reply.header('Content-Disposition', 'attachment; filename="lineage_all_reports.csv"');
    reply.type('text/csv');
    return csv;
  });

  // GET /api/reports/export-all-html
  app.get('/export-all-html', async (request, reply) => {
    const html = services.htmlExport.exportAllAsHtml();

    reply.header('Content-Disposition', 'attachment; filename="lineage-all-reports.html"');
    reply.type('text/html');
    return html;
  });

  // GET /api/reports/:id/export-html
  app.get('/:id/export-html', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const html = services.htmlExport.exportSingleReportAsHtml(parseInt(id, 10));
      const report = repos.report.findById(parseInt(id, 10));
      const fileName = report?.reportName?.replace(/[^a-zA-Z0-9]/g, '_') || `report_${id}`;

      reply.header('Content-Disposition', `attachment; filename="lineage_${fileName}.html"`);
      reply.type('text/html');
      return html;
    } catch (error) {
      reply.status(404);
      return { error: 'Report not found' };
    }
  });

  // GET /api/reports/:id/executions - Get recent executions with parameters
  app.get('/:id/executions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { limit } = request.query as { limit?: string };

    const report = repos.report.findById(parseInt(id, 10));
    if (!report) {
      reply.status(404);
      return { error: 'Report not found' };
    }

    // Get the report path from file path (format: /folder/subfolder/ReportName)
    const reportPath = report.filePath;
    const maxResults = limit ? parseInt(limit, 10) : 20;

    const executions = repos.reportExecution.findByPathLimited(reportPath, maxResults);

    return executions.map(e => ({
      id: e.id,
      executedAt: e.executedAt,
      status: e.status,
      requestType: e.requestType,
      userName: e.userName,
      parameters: e.parameters,
    }));
  });

  // GET /api/reports/unified-export - Unified CSV export with scope parameter
  app.get('/unified-export', async (request, reply) => {
    const { scope } = request.query as { scope?: string };

    let csv: string;
    let fileName: string;

    switch (scope?.toLowerCase()) {
      case 'pbi':
      case 'powerbi':
        csv = services.csvExport.exportPbi();
        fileName = 'lineage_powerbi_reports.csv';
        break;
      case 'ssrs':
        csv = services.csvExport.exportSsrs();
        fileName = 'lineage_ssrs_reports.csv';
        break;
      case 'both':
      case 'all':
      default:
        csv = services.csvExport.exportAll();
        fileName = 'lineage_all_reports.csv';
        break;
    }

    reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
    reply.type('text/csv');
    return csv;
  });

  // GET /api/reports/starred/export-all-csv - Export all starred reports (SSRS + PBI combined)
  app.get('/starred/export-all-csv', async (request, reply) => {
    const csv = services.csvExport.exportAllStarred();
    reply.header('Content-Disposition', 'attachment; filename="lineage_all_starred_reports.csv"');
    reply.type('text/csv');
    return csv;
  });

  // GET /api/reports/starred/custom-tables/export - Export custom tables from starred reports
  app.get('/starred/custom-tables/export', async (request, reply) => {
    const csv = services.csvExport.exportCustomTablesFromStarred();
    reply.header('Content-Disposition', 'attachment; filename="custom_tables_from_starred.csv"');
    reply.type('text/csv');
    return csv;
  });

  // GET /api/reports/starred/report-table-mapping/export - Export report-to-table mapping from starred reports
  app.get('/starred/report-table-mapping/export', async (request, reply) => {
    const csv = services.csvExport.exportReportTableMapping();
    reply.header('Content-Disposition', 'attachment; filename="report_table_mapping.csv"');
    reply.type('text/csv');
    return csv;
  });

  // GET /api/reports/starred/unique-table-columns/export - Export unique table columns from starred reports
  app.get('/starred/unique-table-columns/export', async (request, reply) => {
    const csv = services.csvExport.exportUniqueTableColumns();
    reply.header('Content-Disposition', 'attachment; filename="unique_table_columns.csv"');
    reply.type('text/csv');
    return csv;
  });
}
