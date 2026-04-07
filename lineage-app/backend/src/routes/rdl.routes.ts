import { FastifyInstance } from 'fastify';
import { Services } from '../services/index.js';

export async function rdlRoutes(app: FastifyInstance, services: Services) {
  // GET /api/rdl/scan
  app.get('/scan', async (request, reply) => {
    const { folderPath, filter } = request.query as { folderPath?: string; filter?: string };

    try {
      return services.rdl.scanFolder(folderPath, filter);
    } catch (error) {
      console.error('Error scanning folder:', error);
      reply.status(500);
      return {
        success: false,
        message: `Error scanning folder: ${(error as Error).message}`,
      };
    }
  });

  // POST /api/rdl/:fileName/analyze
  app.post('/:fileName/analyze', async (request, reply) => {
    const { fileName } = request.params as { fileName: string };

    try {
      services.rdl.analyzeFile(fileName);
      return {
        success: true,
        message: `Analysis complete for: ${fileName}`,
      };
    } catch (error) {
      console.error(`Error analyzing file: ${fileName}`, error);
      reply.status(400);
      return {
        success: false,
        message: `Error analyzing file: ${(error as Error).message}`,
      };
    }
  });

  // POST /api/rdl/analyze-all
  app.post('/analyze-all', async () => {
    services.rdl.analyzeAll();
    return {
      success: true,
      message: 'Batch analysis started',
    };
  });

  // GET /api/rdl/processing-status
  app.get('/processing-status', async () => {
    return services.rdl.getProcessingStatus();
  });

  // GET /api/rdl/pending
  app.get('/pending', async () => {
    return services.rdl.getPendingFiles();
  });

  // GET /api/rdl/source-status - Check which sources are available
  app.get('/source-status', async () => {
    return services.rdl.getRdlSourceStatus();
  });

  // POST /api/rdl/load-database - Load RDL reports from CSV
  app.post('/load-database', async () => {
    try {
      const count = services.rdl.loadRdlReportsFromCsv();
      return {
        success: true,
        message: `Loaded ${count} RDL reports from database CSV`,
        count,
      };
    } catch (error) {
      return {
        success: false,
        message: `Error loading RDL reports: ${(error as Error).message}`,
      };
    }
  });

  // GET /api/rdl/scan-database - Scan RDL reports from CSV
  app.get('/scan-database', async (request) => {
    const { filter } = request.query as { filter?: string };
    return services.rdl.scanFromDatabase(filter);
  });

  // POST /api/rdl/database/analyze - Analyze single RDL from database
  app.post('/database/analyze', async (request, reply) => {
    const { filePath } = request.body as { filePath: string };

    if (!filePath) {
      reply.status(400);
      return { success: false, message: 'filePath is required' };
    }

    try {
      services.rdl.analyzeFromDatabase(filePath);
      return {
        success: true,
        message: `Analysis complete for: ${filePath}`,
      };
    } catch (error) {
      console.error(`Error analyzing from database: ${filePath}`, error);
      reply.status(400);
      return {
        success: false,
        message: `Error analyzing: ${(error as Error).message}`,
      };
    }
  });

  // POST /api/rdl/analyze-all-database - Analyze all from database
  app.post('/analyze-all-database', async (request) => {
    const { filter } = request.query as { filter?: string };
    services.rdl.analyzeAllFromDatabase(filter);
    return {
      success: true,
      message: 'Batch analysis from database started',
    };
  });
}
