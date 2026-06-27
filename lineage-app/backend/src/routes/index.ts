import { FastifyInstance } from "fastify";
import { Services } from "../services/index.js";
import { Repositories } from "../repositories/index.js";
import { metadataRoutes } from "./metadata.routes.js";
import { rdlRoutes } from "./rdl.routes.js";
import { reportsRoutes } from "./reports.routes.js";
import { pbiRoutes } from "./pbi.routes.js";

export async function registerRoutes(
  app: FastifyInstance,
  services: Services,
  repos: Repositories,
): Promise<void> {
  // Register metadata routes
  app.register(
    async (instance) => {
      await metadataRoutes(instance, services, repos);
    },
    { prefix: "/api/metadata" },
  );

  // Register RDL routes
  app.register(
    async (instance) => {
      await rdlRoutes(instance, services);
    },
    { prefix: "/api/rdl" },
  );

  // Register reports/lineage routes
  app.register(
    async (instance) => {
      await reportsRoutes(instance, services, repos);
    },
    { prefix: "/api/reports" },
  );

  // Register Power BI routes
  app.register(
    async (instance) => {
      await pbiRoutes(instance, services, repos);
    },
    { prefix: "/api/pbi" },
  );
}
