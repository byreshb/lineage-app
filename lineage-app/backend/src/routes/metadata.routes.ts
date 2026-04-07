import { FastifyInstance } from 'fastify';
import { Services } from '../services/index.js';
import { Repositories } from '../repositories/index.js';
import { loadAppConfig } from '../config/index.js';

export async function metadataRoutes(app: FastifyInstance, services: Services, repos: Repositories) {
  // GET /api/metadata/app-config - Get app configuration (features, etc.)
  app.get('/app-config', async () => {
    return loadAppConfig();
  });

  // POST /api/metadata/load
  app.post('/load', async (request, reply) => {
    try {
      const { csvFolder } = request.query as { csvFolder?: string };

      if (csvFolder) {
        await services.metadata.loadMetadata(csvFolder);
      } else {
        await services.metadata.loadMetadata();
      }

      const status = services.metadata.getStatus();

      return {
        success: true,
        message: 'Metadata loaded successfully',
        procCount: status.procCount,
        viewCount: status.viewCount,
        tableCount: status.tableCount,
      };
    } catch (error) {
      console.error('Error loading metadata', error);
      reply.status(400);
      return {
        success: false,
        message: `Error loading metadata: ${(error as Error).message}`,
      };
    }
  });

  // GET /api/metadata/status
  app.get('/status', async () => {
    return services.metadata.getStatus();
  });

  // GET /api/metadata/linked-reports - List all linked reports
  app.get('/linked-reports', async () => {
    return repos.linkedReport.findAll();
  });

  // GET /api/metadata/linked-reports/search?q=name - Search linked reports by name
  app.get('/linked-reports/search', async (request) => {
    const { q } = request.query as { q?: string };
    if (!q || q.trim() === '') {
      return repos.linkedReport.findAll();
    }
    return repos.linkedReport.searchByName(q.trim());
  });

  // GET /api/metadata/linked-reports/starred - Get all starred linked reports
  app.get('/linked-reports/starred', async () => {
    return repos.linkedReport.findStarred();
  });

  // GET /api/metadata/linked-reports/starred/count - Get count of starred linked reports
  app.get('/linked-reports/starred/count', async () => {
    return { count: repos.linkedReport.countStarred() };
  });

  // POST /api/metadata/linked-reports/:id/star - Toggle star status
  app.post('/linked-reports/:id/star', async (request, reply) => {
    const { id } = request.params as { id: string };
    const linkedReport = repos.linkedReport.findById(parseInt(id, 10));
    if (!linkedReport) {
      reply.status(404);
      return { error: 'Linked report not found' };
    }
    const newStarred = repos.linkedReport.toggleStar(parseInt(id, 10));
    return { id: parseInt(id, 10), starred: newStarred };
  });

  // GET /api/metadata/linked-reports/:id - Get single linked report
  app.get('/linked-reports/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const linkedReport = repos.linkedReport.findById(parseInt(id, 10));
    if (!linkedReport) {
      reply.status(404);
      return { error: 'Linked report not found' };
    }
    return linkedReport;
  });

  // GET /api/metadata/linked-reports/by-template/:templatePath - Find linked reports by template
  app.get('/linked-reports/by-template/:templatePath', async (request) => {
    const { templatePath } = request.params as { templatePath: string };
    return repos.linkedReport.findByTemplatePath(decodeURIComponent(templatePath));
  });
}
