import { Repositories } from '../repositories/index.js';
import { SourceTable } from '../types/index.js';
import { extractTables, TableReference } from '../parsers/sql.analyzer.js';

export class AnalyzerService {
  constructor(private repos: Repositories) {}

  analyzeStoredProcedure(procName: string): SourceTable[] {
    const proc = this.repos.storedProc.findByName(procName);
    if (!proc) {
      console.warn(`Stored procedure not found: ${procName}`);
      return [];
    }
    return this.analyzeDefinition(proc.definition, new Set());
  }

  analyzeView(viewName: string): SourceTable[] {
    const view = this.repos.view.findByName(viewName);
    if (!view) {
      console.warn(`View not found: ${viewName}`);
      return [];
    }
    return this.analyzeDefinition(view.definition, new Set());
  }

  analyzeDefinition(definition: string | null, visitedViews: Set<string>): SourceTable[] {
    if (!definition) return [];

    const tables: SourceTable[] = [];
    const refs = extractTables(definition);

    for (const ref of refs) {
      // Check if it's a view
      const view = this.findView(ref);
      if (view) {
        const viewKey = `${view.schemaName}.${view.viewName}`;
        if (!visitedViews.has(viewKey)) {
          visitedViews.add(viewKey);
          tables.push(...this.analyzeDefinition(view.definition, visitedViews));
        }
      } else {
        // It's a table
        const table = this.findTable(ref);
        if (table) {
          tables.push(table);
        } else {
          // Create placeholder for unknown tables
          tables.push({
            id: null,
            server: ref.server,
            databaseName: ref.database,
            schemaName: ref.schema || 'dbo',
            tableName: ref.tableName,
            hasPk: null,
            sourceType: ref.sourceType,
          });
        }
      }
    }

    return tables;
  }

  getTablesForProcedure(procName: string): SourceTable[] {
    const tables = this.analyzeStoredProcedure(procName);
    return tables.sort((a, b) =>
      `${a.schemaName}.${a.tableName}`.localeCompare(`${b.schemaName}.${b.tableName}`)
    );
  }

  getTablesForSql(sql: string): SourceTable[] {
    const tables = this.analyzeDefinition(sql, new Set());
    return tables.sort((a, b) =>
      `${a.schemaName}.${a.tableName}`.localeCompare(`${b.schemaName}.${b.tableName}`)
    );
  }

  private findView(ref: TableReference) {
    if (ref.schema) {
      return this.repos.view.findBySchemaAndName(ref.schema, ref.tableName);
    }
    return this.repos.view.findByName(ref.tableName);
  }

  private findTable(ref: TableReference) {
    if (ref.server && ref.database && ref.schema) {
      return this.repos.table.findByFullName(ref.server, ref.database, ref.schema, ref.tableName);
    }
    if (ref.schema) {
      return this.repos.table.findBySchemaAndName(ref.schema, ref.tableName);
    }
    return this.repos.table.findByName(ref.tableName);
  }
}
