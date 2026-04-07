import { FastifyInstance } from 'fastify';
import { Services } from '../services/index.js';
import { Repositories } from '../repositories/index.js';

export async function pbiRoutes(
  app: FastifyInstance,
  services: Services,
  repos: Repositories
) {
  // POST /api/pbi/load - Load PBI data from Excel file
  app.post('/load', async (request, reply) => {
    try {
      const result = services.pbiLineage.loadFromExcel();
      return {
        success: true,
        message: `Loaded ${result.reportCount} Power BI reports with ${result.tableCount} table mappings`,
        reportCount: result.reportCount,
        tableCount: result.tableCount,
      };
    } catch (error: any) {
      reply.status(500);
      return {
        success: false,
        message: error.message || 'Failed to load PBI data',
      };
    }
  });

  // GET /api/pbi/status - Check if PBI data is loaded
  app.get('/status', async () => {
    return services.pbiLineage.getStatus();
  });

  // GET /api/pbi/reports - List all PBI reports
  app.get('/reports', async () => {
    const reports = repos.pbiReport.findAll();
    return reports.map((r) => ({
      id: r.id,
      reportName: r.reportName,
      starred: r.starred,
      createdAt: r.createdAt,
    }));
  });

  // POST /api/pbi/reports/:id/star - Toggle star status
  app.post('/reports/:id/star', async (request, reply) => {
    const { id } = request.params as { id: string };
    const reportId = parseInt(id, 10);
    const report = repos.pbiReport.findById(reportId);

    if (!report) {
      reply.status(404);
      return { error: 'PBI Report not found' };
    }

    const newStarred = repos.pbiReport.toggleStar(reportId);
    return { id: reportId, starred: newStarred };
  });

  // GET /api/pbi/reports/:id - Get single PBI report
  app.get('/reports/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const report = repos.pbiReport.findById(parseInt(id, 10));

    if (!report) {
      reply.status(404);
      return { error: 'PBI Report not found' };
    }

    const tables = repos.pbiTable.findByReportId(report.id!);

    return {
      id: report.id,
      reportName: report.reportName,
      starred: report.starred,
      createdAt: report.createdAt,
      tableCount: tables.length,
      tables: tables.map((t) => ({
        id: t.id,
        tableName: t.tableName,
        sourceDatabase: t.sourceDatabase,
        sourceViewOrTable: t.sourceViewOrTable,
      })),
    };
  });

  // GET /api/pbi/reports/:id/lineage - Get lineage graph for D3
  app.get('/reports/:id/lineage', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      return services.pbiLineage.getLineageGraph(parseInt(id, 10));
    } catch (error) {
      reply.status(404);
      return { error: 'PBI Report not found' };
    }
  });

  // POST /api/pbi/reports/:id/build-lineage - Build lineage for a report
  app.post('/reports/:id/build-lineage', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const graph = services.pbiLineage.buildLineageGraph(parseInt(id, 10));
      return {
        success: true,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
      };
    } catch (error: any) {
      reply.status(404);
      return { error: error.message || 'PBI Report not found' };
    }
  });

  // GET /api/pbi/reports/:id/tables - Get source tables
  app.get('/reports/:id/tables', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      return services.pbiLineage.getSourceTables(parseInt(id, 10));
    } catch (error) {
      reply.status(404);
      return { error: 'PBI Report not found' };
    }
  });

  // GET /api/pbi/reports/:id/external-sources - Get external sources summary
  app.get('/reports/:id/external-sources', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      return services.pbiLineage.getExternalSources(parseInt(id, 10));
    } catch (error) {
      reply.status(404);
      return { error: 'PBI Report not found' };
    }
  });

  // GET /api/pbi/reports/:id/export - Export single report CSV
  app.get('/reports/:id/export', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const csv = services.pbiLineage.exportToCsv(parseInt(id, 10));
      const report = repos.pbiReport.findById(parseInt(id, 10));
      const fileName = report?.reportName?.replace(/[^a-zA-Z0-9]/g, '_') || `pbi_report_${id}`;

      reply.header('Content-Disposition', `attachment; filename="lineage_pbi_${fileName}.csv"`);
      reply.type('text/csv');
      return csv;
    } catch (error) {
      reply.status(404);
      return { error: 'PBI Report not found' };
    }
  });

  // GET /api/pbi/export-all - Export all PBI reports CSV
  app.get('/export-all', async (request, reply) => {
    const csv = services.pbiLineage.exportAllToCsv();

    reply.header('Content-Disposition', 'attachment; filename="lineage_pbi_all_reports.csv"');
    reply.type('text/csv');
    return csv;
  });

  // GET /api/pbi/export-starred - Export starred PBI reports CSV
  app.get('/export-starred', async (request, reply) => {
    const csv = services.pbiLineage.exportStarredToCsv();

    reply.header('Content-Disposition', 'attachment; filename="lineage_pbi_starred_reports.csv"');
    reply.type('text/csv');
    return csv;
  });

  // GET /api/pbi/export-all-html - Export all PBI reports as HTML
  app.get('/export-all-html', async (request, reply) => {
    try {
      const html = services.htmlExport.exportPbiAllAsHtml();
      reply.header('Content-Disposition', 'attachment; filename="lineage_pbi_all_reports.html"');
      reply.type('text/html');
      return html;
    } catch (error: any) {
      reply.status(500);
      return { error: error.message || 'Failed to export HTML' };
    }
  });

  // GET /api/pbi/export-starred-html - Export starred PBI reports as HTML
  app.get('/export-starred-html', async (request, reply) => {
    try {
      const html = services.htmlExport.exportPbiStarredAsHtml();
      reply.header('Content-Disposition', 'attachment; filename="lineage_pbi_starred_reports.html"');
      reply.type('text/html');
      return html;
    } catch (error: any) {
      reply.status(500);
      return { error: error.message || 'Failed to export HTML' };
    }
  });
}
