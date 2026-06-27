import Fastify from "fastify";
import cors from "@fastify/cors";
import path from "path";
import { config, resolvedPaths } from "./config/index.js";
import { Repositories } from "./repositories/index.js";
import { Services } from "./services/index.js";
import { registerRoutes } from "./routes/index.js";

// Log directory - next to the database
const logDir = path.dirname(resolvedPaths.database);
const logFile = path.join(logDir, "logs", "app.log");

export async function buildApp(repos: Repositories, services: Services) {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport: {
        targets: [
          // Console output (pretty)
          {
            target: "pino-pretty",
            level: config.logLevel,
            options: {
              colorize: true,
              translateTime: "SYS:standard",
            },
          },
          // File output (rotating) - debug level for troubleshooting
          {
            target: "pino-roll",
            level: "debug",
            options: {
              file: logFile,
              frequency: "daily",
              limit: { count: 5 }, // Keep 5 files
              size: "5m", // 5MB per file
              mkdir: true,
            },
          },
        ],
      },
    },
  });

  // Register CORS
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Health check
  app.get("/api/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // Register all routes
  await registerRoutes(app, services, repos);

  return app;
}
