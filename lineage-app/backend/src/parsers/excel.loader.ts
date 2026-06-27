import XLSX from "xlsx";
import path from "path";
import fs from "fs";

export interface PbiExcelRow {
  pbiFile: string;
  pbiTable: string;
  sourceDatabase: string;
  sourceViewOrTable: string;
}

/**
 * Load Power BI data source mappings from Excel file.
 * Expected format: "Source Tables" sheet with:
 * - Column A: PBI File (Power BI report name)
 * - Column B: PBI Table (table name within report)
 * - Column F: Source Database
 * - Column H: Unique view/table (source view or table name)
 *   NOTE: Column H uses SPACE-separated format: "schema tablename"
 *         This differs from SSRS RDL which uses DOT format: "schema.tablename"
 *         The PbiLineageService normalizes space format to dot format for lookups.
 *
 * Data starts at row 6 (rows 1-5 are headers/metadata)
 */
export function loadPbiExcel(filePath: string): PbiExcelRow[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel file not found: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath);

  // Look for "Source Tables" sheet
  const sheetName = "Source Tables";
  if (!workbook.SheetNames.includes(sheetName)) {
    throw new Error(
      `Sheet "${sheetName}" not found in Excel file. Available sheets: ${workbook.SheetNames.join(", ")}`,
    );
  }

  const sheet = workbook.Sheets[sheetName];

  // Convert to JSON, starting from row 6 (0-indexed: row 5)
  // Using header: 1 to get array of arrays
  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const results: PbiExcelRow[] = [];

  // Data starts at row 6 (index 5), process until row 156 or end of data
  for (let i = 5; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    // Column indices: A=0, B=1, F=5, H=7
    const pbiFile = String(row[0] || "").trim();
    const pbiTable = String(row[1] || "").trim();
    const sourceDatabase = String(row[5] || "").trim();
    const sourceViewOrTable = String(row[7] || "").trim();

    // Skip rows without essential data
    if (!pbiFile || !sourceViewOrTable) continue;

    results.push({
      pbiFile,
      pbiTable,
      sourceDatabase,
      sourceViewOrTable,
    });
  }

  console.log(`Loaded ${results.length} rows from Excel file`);
  return results;
}

/**
 * Get default path for PBI Excel file in data folder
 */
export function getDefaultPbiExcelPath(dataFolder: string): string {
  return path.join(dataFolder, "FP Reporting_DataSourcesMapping.xlsx");
}
