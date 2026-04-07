import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ConfigSchema = z.object({
  port: z.number().default(8080),
  databasePath: z.string().default('./lineage.db'),
  rdlFolder: z.string().default('./reports'),
  csvFolder: z.string().default('./data'),
  timezone: z.string().default('America/Vancouver'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

const rawConfig = {
  port: parseInt(process.env.PORT || '8080', 10),
  databasePath: process.env.DATABASE_PATH || './lineage.db',
  rdlFolder: process.env.RDL_FOLDER || './reports',
  csvFolder: process.env.CSV_FOLDER || './data',
  timezone: process.env.TIMEZONE || 'America/Vancouver',
  logLevel: process.env.LOG_LEVEL || 'info',
};

export const config = ConfigSchema.parse(rawConfig);

// Resolve paths relative to backend directory
const backendDir = path.resolve(__dirname, '../..');
export const resolvedPaths = {
  database: path.resolve(backendDir, config.databasePath),
  rdlFolder: path.resolve(backendDir, config.rdlFolder),
  csvFolder: path.resolve(backendDir, config.csvFolder),
  schemaFile: path.resolve(__dirname, '../db/schema.sql'),
  appConfig: path.resolve(backendDir, config.csvFolder, 'app-config.json'),
};

// App Config (loaded from data/app-config.json)
export interface AppConfig {
  features: {
    enableFileBasedRdl: boolean;
    enablePowerBI: boolean;
  };
}

const defaultAppConfig: AppConfig = {
  features: {
    enableFileBasedRdl: false,
    enablePowerBI: true,
  },
};

export function loadAppConfig(): AppConfig {
  try {
    if (fs.existsSync(resolvedPaths.appConfig)) {
      const content = fs.readFileSync(resolvedPaths.appConfig, 'utf-8');
      const parsed = JSON.parse(content);
      return {
        features: {
          enableFileBasedRdl: parsed.features?.enableFileBasedRdl ?? false,
          enablePowerBI: parsed.features?.enablePowerBI ?? true,
        },
      };
    }
  } catch (err) {
    console.warn('Failed to load app-config.json, using defaults:', err);
  }
  return defaultAppConfig;
}
