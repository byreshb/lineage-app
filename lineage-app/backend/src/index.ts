import { buildApp } from "./app.js";
import { config } from "./config/index.js";
import { getDatabase, closeDatabase } from "./db/database.js";
import { createRepositories } from "./repositories/index.js";
import { createServices } from "./services/index.js";

async function main() {
  // Initialize database
  const db = getDatabase();
  console.log("Database connection established");

  // Create repositories and services
  const repos = createRepositories(db);
  const services = createServices(repos);

  // Build and start the app
  const app = await buildApp(repos, services);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down...");
    await app.close();
    closeDatabase();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    console.log(`Server running on http://localhost:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
