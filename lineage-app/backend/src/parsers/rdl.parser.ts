import { XMLParser } from "fast-xml-parser";
import fs from "fs";
import path from "path";
import { Dataset, DataSource, CommandType } from "../types/index.js";

export interface RdlParseResult {
  reportName: string;
  datasets: Omit<Dataset, "id" | "reportId">[];
  dataSources: Omit<DataSource, "id" | "reportId">[];
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true, // Handle XML namespaces
  parseAttributeValue: true,
  trimValues: true,
});

export function parseRdlFile(rdlFilePath: string): RdlParseResult {
  console.log(`Parsing RDL file: ${path.basename(rdlFilePath)}`);

  const content = fs.readFileSync(rdlFilePath, "utf-8");
  const reportName = extractReportName(rdlFilePath);
  return parseRdlContent(content, reportName);
}

export function parseRdlContent(
  content: string,
  reportName: string,
): RdlParseResult {
  const contentLength = content?.length || 0;
  const endsWithReport = content?.trim().endsWith("</Report>") || false;
  const last50Chars = content?.slice(-50) || "";

  console.log(
    `Parsing RDL content for: ${reportName} (${contentLength} chars, valid XML ending: ${endsWithReport})`,
  );

  if (!endsWithReport) {
    console.warn(
      `WARNING: RDL content appears truncated for ${reportName}. Last 50 chars: "${last50Chars}"`,
    );
  }

  let parsed;
  try {
    parsed = xmlParser.parse(content);
  } catch (err) {
    console.error(
      `XML PARSE ERROR for ${reportName}: ${err instanceof Error ? err.message : err}`,
    );
    console.error(
      `Content length: ${contentLength}, ends with </Report>: ${endsWithReport}`,
    );
    throw err;
  }

  // Get the Report element (root)
  const report = parsed.Report || parsed;

  const result: RdlParseResult = {
    reportName,
    datasets: [],
    dataSources: [],
  };

  // Parse DataSources
  const dataSources = getArray(report.DataSources?.DataSource);
  for (const dsElement of dataSources) {
    const ds = parseDataSource(dsElement);
    if (ds) {
      result.dataSources.push(ds);
    }
  }

  // Parse DataSets
  const dataSets = getArray(report.DataSets?.DataSet);
  for (const dsElement of dataSets) {
    const ds = parseDataSet(dsElement);
    if (ds) {
      result.datasets.push(ds);
    }
  }

  console.log(
    `Parsed ${result.dataSources.length} data sources, ${result.datasets.length} datasets from ${reportName}`,
  );
  return result;
}

function extractReportName(rdlFilePath: string): string {
  // Use file name as report name (most reliable)
  // Remove file extension and common suffixes like "(Template)"
  return path
    .basename(rdlFilePath)
    .replace(".rdl", "")
    .replace(" (Template)", "")
    .replace("(Template)", "")
    .trim();
}

function parseDataSource(
  dsElement: any,
): Omit<DataSource, "id" | "reportId"> | null {
  const ds: Omit<DataSource, "id" | "reportId"> = {
    sourceName: dsElement["@_Name"] || "",
    sourceType: null,
    referencePath: null,
    connectionString: null,
    server: null,
    databaseName: null,
  };

  // Check for DataSourceReference (shared data source)
  const reference = dsElement.DataSourceReference;
  if (reference) {
    ds.referencePath = reference;
    ds.sourceType = "SHARED";

    // Try to extract database from reference path
    // e.g., /Datasource/SysproReporting -> SysproReporting
    if (typeof reference === "string" && reference.includes("/")) {
      ds.databaseName = reference.substring(reference.lastIndexOf("/") + 1);
    }
    console.log(`Found shared DataSource: ${ds.sourceName} -> ${reference}`);
  } else {
    // Check for embedded connection string
    const connectionString =
      dsElement.ConnectionProperties?.ConnectString ||
      dsElement.ConnectionString;
    if (connectionString) {
      ds.connectionString = connectionString;
      ds.sourceType = "EMBEDDED";
      parseConnectionString(ds, connectionString);
      console.log(
        `Found embedded DataSource: ${ds.sourceName} -> ${connectionString.substring(0, 50)}...`,
      );
    }
  }

  return ds;
}

function parseConnectionString(
  ds: Omit<DataSource, "id" | "reportId">,
  connStr: string,
): void {
  if (!connStr) return;

  const upper = connStr.toUpperCase();

  // Extract server
  const serverIdx = upper.indexOf("DATA SOURCE=");
  if (serverIdx >= 0) {
    const start = serverIdx + 12;
    let end = connStr.indexOf(";", start);
    if (end < 0) end = connStr.length;
    ds.server = connStr.substring(start, end).trim();
  }

  // Extract database
  const dbIdx = upper.indexOf("INITIAL CATALOG=");
  if (dbIdx >= 0) {
    const start = dbIdx + 16;
    let end = connStr.indexOf(";", start);
    if (end < 0) end = connStr.length;
    ds.databaseName = connStr.substring(start, end).trim();
  }
}

function parseDataSet(
  dataSetElement: any,
): Omit<Dataset, "id" | "reportId"> | null {
  const dataset: Omit<Dataset, "id" | "reportId"> = {
    datasetName: dataSetElement["@_Name"] || dataSetElement.Name || "",
    commandType: null,
    commandText: null,
    sharedDatasetPath: null,
    fields: null,
  };

  // Extract fields
  const fields = extractFields(dataSetElement);
  if (fields) {
    dataset.fields = fields;
  }

  // Check for SharedDataSet
  const sharedDataSet = dataSetElement.SharedDataSet;
  if (sharedDataSet) {
    const sharedPath = sharedDataSet.SharedDataSetReference;
    dataset.commandType = "SharedDataSet" as CommandType;
    dataset.sharedDatasetPath = sharedPath;
    return dataset;
  }

  // Find Query element
  const queryElement = dataSetElement.Query;
  if (!queryElement) {
    console.warn(`No Query element found for dataset: ${dataset.datasetName}`);
    return dataset;
  }

  // Get CommandType
  let commandType = queryElement.CommandType || "Text";
  dataset.commandType = commandType as CommandType;

  // Get CommandText
  const commandText = queryElement.CommandText;
  dataset.commandText = commandText || null;

  console.log(
    `Dataset: ${dataset.datasetName} - Type: ${commandType} - Command: ${commandText ? commandText.substring(0, 50) + "..." : "null"}`,
  );

  return dataset;
}

function extractFields(dataSetElement: any): string | null {
  const fieldNames: string[] = [];

  const fieldsElement = dataSetElement.Fields;
  if (fieldsElement) {
    const fields = getArray(fieldsElement.Field);
    for (const field of fields) {
      const fieldName = field["@_Name"];
      if (fieldName) {
        fieldNames.push(fieldName);
      }
    }
  }

  return fieldNames.length > 0 ? fieldNames.join(", ") : null;
}

// Helper to always get an array, even for single elements
function getArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
