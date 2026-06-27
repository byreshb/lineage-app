import fs from "fs";
import path from "path";
import { glob } from "glob";
import { resolvedPaths } from "../config/index.js";
import { Repositories } from "../repositories/index.js";
import {
  RdlFileDto,
  ProcessingStatusDto,
  Report,
  Dataset,
  DataSource,
  RdlSource,
} from "../types/index.js";
import { parseRdlFile, parseRdlContent } from "../parsers/rdl.parser.js";
import { loadRdlReports, RdlReportCsv } from "../parsers/csv.loader.js";
import { LineageService } from "./lineage.service.js";
import dayjs from "dayjs";

export class RdlService {
  private isProcessing = false;
  private totalFiles = 0;
  private completedFiles = 0;
  private errorFiles = 0;
  private currentFile = "";
  private startTime: Date | null = null;
  private filePathCache = new Map<string, string>();

  // CSV-loaded RDL reports cache
  private rdlReportsCache = new Map<string, RdlReportCsv>();
  private rdlReportsLoaded = false;

  constructor(
    private repos: Repositories,
    private lineageService: LineageService,
  ) {}

  // Load RDL reports from CSV/TXT file
  loadRdlReportsFromCsv(): number {
    // Try .txt first (tab-delimited, recommended), then .csv
    let filePath = path.join(resolvedPaths.csvFolder, "rdl_reports.txt");
    if (!fs.existsSync(filePath)) {
      filePath = path.join(resolvedPaths.csvFolder, "rdl_reports.csv");
    }

    if (!fs.existsSync(filePath)) {
      console.warn(
        `RDL reports file not found: rdl_reports.txt or rdl_reports.csv`,
      );
      return 0;
    }

    const reports = loadRdlReports(filePath);
    this.rdlReportsCache.clear();

    for (const report of reports) {
      // Use report path as key (includes name, unique per report)
      const key = report.reportPath.trim();
      this.rdlReportsCache.set(key, report);
    }

    this.rdlReportsLoaded = true;
    console.log(`Loaded ${this.rdlReportsCache.size} RDL reports from CSV`);
    return this.rdlReportsCache.size;
  }

  // Check if CSV/TXT source is available
  isRdlCsvAvailable(): boolean {
    const txtPath = path.join(resolvedPaths.csvFolder, "rdl_reports.txt");
    const csvPath = path.join(resolvedPaths.csvFolder, "rdl_reports.csv");
    return fs.existsSync(txtPath) || fs.existsSync(csvPath);
  }

  // Get RDL source status
  getRdlSourceStatus(): {
    filesAvailable: boolean;
    databaseAvailable: boolean;
    databaseCount: number;
  } {
    const filesAvailable = fs.existsSync(resolvedPaths.rdlFolder);
    const databaseAvailable = this.isRdlCsvAvailable();
    return {
      filesAvailable,
      databaseAvailable,
      databaseCount: this.rdlReportsCache.size,
    };
  }

  // Scan for RDL files from CSV source
  scanFromDatabase(filter?: string): RdlFileDto[] {
    if (!this.rdlReportsLoaded) {
      this.loadRdlReportsFromCsv();
    }

    const result: RdlFileDto[] = [];
    const filterLower = filter?.toLowerCase() || "";

    for (const [key, report] of this.rdlReportsCache) {
      // Apply name filter
      if (
        filterLower &&
        !report.reportName.toLowerCase().includes(filterLower)
      ) {
        continue;
      }

      const fileName = report.reportName.endsWith(".rdl")
        ? report.reportName
        : report.reportName + ".rdl";

      const dto: RdlFileDto = {
        fileName,
        filePath: report.reportPath,
        status: null,
        lastRunAt: null,
        errorMessage: null,
        reportId: null,
        reportName: null,
      };

      const existing = this.repos.report.findByFileName(
        fileName,
        "DATABASE",
        report.reportPath,
      );
      if (existing) {
        dto.status = existing.status;
        dto.lastRunAt = this.formatForDisplay(existing.lastRunAt);
        dto.errorMessage = existing.errorMessage;
        dto.reportId = existing.id;
        dto.reportName = existing.reportName;
        dto.starred = existing.starred;
      } else {
        dto.status = "PENDING";
        dto.starred = false;
      }

      // Add execution history data if available
      const execHistory = this.repos.executionHistory.findByPath(
        report.reportPath,
      );
      if (execHistory) {
        dto.executionCount = execHistory.executionCount;
        dto.lastExecutedAt = execHistory.lastExecutedAt;
        dto.daysSinceLastRun = execHistory.daysSinceLastRun;
        dto.successCount = execHistory.successCount;
        dto.errorCount = execHistory.errorCount;
        dto.interactiveCount = execHistory.interactiveCount;
        dto.subscriptionCount = execHistory.subscriptionCount;
        dto.neverRan = execHistory.executionCount === 0;
      } else {
        // No execution history found - treat as unknown
        dto.neverRan = undefined;
      }

      // Debug: log first few reports with their execution data
      if (result.length < 3) {
        console.log(
          `Report: ${dto.fileName}, path: ${report.reportPath}, neverRan: ${dto.neverRan}, execCount: ${dto.executionCount}`,
        );
      }

      result.push(dto);
    }

    console.log(`Found ${result.length} RDL reports from database CSV`);
    return result;
  }

  // Analyze RDL from CSV content
  analyzeFromDatabase(reportPath: string): void {
    console.log(`Analyzing RDL from database: ${reportPath}`);

    if (!this.rdlReportsLoaded) {
      this.loadRdlReportsFromCsv();
    }

    // Find by path (the cache key)
    const rdlReport = this.rdlReportsCache.get(reportPath.trim());

    if (!rdlReport) {
      throw new Error(`RDL report not found in database: ${reportPath}`);
    }

    const fileName = rdlReport.reportName.endsWith(".rdl")
      ? rdlReport.reportName
      : rdlReport.reportName + ".rdl";

    // Get or create report (DATABASE source) - pass filePath to handle duplicate names
    let report = this.repos.report.findByFileName(
      fileName,
      "DATABASE",
      rdlReport.reportPath,
    );
    if (!report) {
      report = {
        id: null,
        fileName,
        filePath: rdlReport.reportPath,
        reportName: null,
        source: "DATABASE",
        status: "PENDING",
        starred: false,
        lastRunAt: null,
        errorMessage: null,
        createdAt: null,
      };
    }

    report!.filePath = rdlReport.reportPath;
    report!.status = "PROCESSING";
    report!.errorMessage = null;
    report = this.repos.report.save(report!);

    try {
      // Delete existing data
      this.repos.lineage.deleteByReportId(report.id!);
      this.repos.dataset.deleteByReportId(report.id!);
      this.repos.dataSource.deleteByReportId(report.id!);

      // Parse RDL content directly
      const parseResult = parseRdlContent(rdlReport.rdlContent, reportPath);
      report.reportName = parseResult.reportName;
      report = this.repos.report.save(report);

      // Save data sources
      for (const ds of parseResult.dataSources) {
        const dataSource: DataSource = {
          ...ds,
          id: null,
          reportId: report.id!,
        };
        this.repos.dataSource.save(dataSource);
      }

      // Save datasets
      for (const ds of parseResult.datasets) {
        const dataset: Dataset = {
          ...ds,
          id: null,
          reportId: report.id!,
        };
        this.repos.dataset.save(dataset);
      }

      // Build lineage
      this.lineageService.buildLineage(report.id!);

      // Set status to COMPLETED
      this.repos.report.updateStatus(report.id!, "COMPLETED", null);
      console.log(`Analysis complete for: ${fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error analyzing report: ${fileName}`, error);
      this.repos.report.updateStatus(report.id!, "ERROR", message);
      throw error;
    }
  }

  // Analyze all from database
  analyzeAllFromDatabase(filter?: string): void {
    if (this.isProcessing) {
      console.warn("Analysis already in progress");
      return;
    }

    const files = this.scanFromDatabase(filter);
    this.isProcessing = true;
    this.totalFiles = files.length;
    this.completedFiles = 0;
    this.errorFiles = 0;
    this.startTime = new Date();
    this.currentFile = files.length > 0 ? files[0].fileName : "";

    setImmediate(() => {
      try {
        for (const file of files) {
          this.currentFile = file.fileName;
          try {
            this.analyzeFromDatabase(file.filePath);
            this.completedFiles++;
          } catch (error) {
            this.errorFiles++;
            console.error(`Error processing: ${file.fileName}`, error);
          }
        }
        console.log(
          `Batch analysis complete: ${this.completedFiles} completed, ${this.errorFiles} errors`,
        );
      } finally {
        this.isProcessing = false;
        this.currentFile = "";
      }
    });
  }

  scanFolder(folderPath?: string, filter?: string): RdlFileDto[] {
    const folder = folderPath || resolvedPaths.rdlFolder;
    console.log(`Scanning RDL folder recursively: ${folder}`);

    if (!fs.existsSync(folder)) {
      console.warn(`RDL folder does not exist: ${folder}`);
      return [];
    }

    const stats = fs.statSync(folder);
    if (!stats.isDirectory()) {
      console.warn(`RDL path is not a directory: ${folder}`);
      return [];
    }

    const result: RdlFileDto[] = [];
    this.filePathCache.clear();
    const filterLower = filter?.toLowerCase() || "";

    // Recursively find all .rdl files (use forward slashes for glob on all platforms)
    const normalizedFolder = folder.replace(/\\/g, "/");
    const rdlFiles = glob.sync("**/*.rdl", {
      cwd: normalizedFolder,
      nocase: true,
    });

    for (const relPath of rdlFiles) {
      const filePath = path.join(folder, relPath);
      const fileName = path.basename(filePath);

      // Apply name filter
      if (filterLower && !fileName.toLowerCase().includes(filterLower)) {
        continue;
      }

      this.filePathCache.set(fileName, filePath);

      const dto: RdlFileDto = {
        fileName,
        filePath,
        status: null,
        lastRunAt: null,
        errorMessage: null,
        reportId: null,
        reportName: null,
      };

      const existing = this.repos.report.findByFileName(fileName, "FILES");
      if (existing) {
        dto.status = existing.status;
        dto.lastRunAt = this.formatForDisplay(existing.lastRunAt);
        dto.errorMessage = existing.errorMessage;
        dto.reportId = existing.id;
        dto.reportName = existing.reportName;
        dto.starred = existing.starred;

        // Try to find execution history by report path if we have a report
        if (existing.filePath) {
          const execHistory = this.repos.executionHistory.findByPath(
            existing.filePath,
          );
          if (execHistory) {
            dto.executionCount = execHistory.executionCount;
            dto.lastExecutedAt = execHistory.lastExecutedAt;
            dto.daysSinceLastRun = execHistory.daysSinceLastRun;
            dto.successCount = execHistory.successCount;
            dto.errorCount = execHistory.errorCount;
            dto.interactiveCount = execHistory.interactiveCount;
            dto.subscriptionCount = execHistory.subscriptionCount;
            dto.neverRan = execHistory.executionCount === 0;
          }
        }
      } else {
        dto.status = "PENDING";
        dto.starred = false;
      }

      result.push(dto);
    }

    console.log(`Found ${result.length} RDL files`);
    return result;
  }

  analyzeFile(fileName: string): void {
    console.log(`Analyzing RDL file: ${fileName}`);

    // Find the file
    let filePath = this.filePathCache.get(fileName);
    let rdlFile: string;

    if (filePath && fs.existsSync(filePath)) {
      rdlFile = filePath;
    } else {
      const existing = this.repos.report.findByFileName(fileName, "FILES");
      if (existing?.filePath && fs.existsSync(existing.filePath)) {
        rdlFile = existing.filePath;
      } else {
        rdlFile = path.join(resolvedPaths.rdlFolder, fileName);
      }
    }

    if (!fs.existsSync(rdlFile)) {
      this.scanFolder();
      filePath = this.filePathCache.get(fileName);
      if (filePath) rdlFile = filePath;
    }

    if (!fs.existsSync(rdlFile)) {
      throw new Error(`RDL file not found: ${fileName}`);
    }

    // Get or create report (FILES source)
    let report = this.repos.report.findByFileName(fileName, "FILES");
    if (!report) {
      report = {
        id: null,
        fileName,
        filePath: rdlFile,
        reportName: null,
        source: "FILES",
        status: "PENDING",
        starred: false,
        lastRunAt: null,
        errorMessage: null,
        createdAt: null,
      };
    }

    report!.filePath = rdlFile;
    report!.status = "PROCESSING";
    report!.errorMessage = null;
    report = this.repos.report.save(report!);

    try {
      // Delete existing data
      this.repos.lineage.deleteByReportId(report.id!);
      this.repos.dataset.deleteByReportId(report.id!);
      this.repos.dataSource.deleteByReportId(report.id!);

      // Parse RDL file
      const parseResult = parseRdlFile(rdlFile);
      report.reportName = parseResult.reportName;
      report = this.repos.report.save(report);

      // Save data sources
      for (const ds of parseResult.dataSources) {
        const dataSource: DataSource = {
          ...ds,
          id: null,
          reportId: report.id!,
        };
        this.repos.dataSource.save(dataSource);
      }

      // Save datasets
      for (const ds of parseResult.datasets) {
        const dataset: Dataset = {
          ...ds,
          id: null,
          reportId: report.id!,
        };
        this.repos.dataset.save(dataset);
      }

      // Build lineage
      this.lineageService.buildLineage(report.id!);

      // Set status to COMPLETED
      this.repos.report.updateStatus(report.id!, "COMPLETED", null);
      console.log(`Analysis complete for: ${fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error analyzing file: ${fileName}`, error);
      this.repos.report.updateStatus(report.id!, "ERROR", message);
      throw error;
    }
  }

  analyzeAll(): void {
    if (this.isProcessing) {
      console.warn("Analysis already in progress");
      return;
    }

    // Set state BEFORE setImmediate to avoid race condition with status polling
    const files = this.scanFolder();
    this.isProcessing = true;
    this.totalFiles = files.length;
    this.completedFiles = 0;
    this.errorFiles = 0;
    this.startTime = new Date();
    this.currentFile = files.length > 0 ? files[0].fileName : "";

    setImmediate(() => {
      try {
        this.runAnalysisOnAllFilesInternal(files);
      } finally {
        this.isProcessing = false;
        this.currentFile = "";
      }
    });
  }

  analyzeAllSync(): void {
    const files = this.scanFolder();
    this.totalFiles = files.length;
    this.completedFiles = 0;
    this.errorFiles = 0;
    this.startTime = new Date();
    this.isProcessing = true;
    try {
      this.runAnalysisOnAllFilesInternal(files);
    } finally {
      this.isProcessing = false;
      this.currentFile = "";
    }
  }

  private runAnalysisOnAllFilesInternal(files: RdlFileDto[]): void {
    for (const file of files) {
      this.currentFile = file.fileName;

      try {
        this.analyzeFile(file.fileName);
        this.completedFiles++;
      } catch (error) {
        this.errorFiles++;
        console.error(`Error processing file: ${file.fileName}`, error);
      }
    }

    console.log(
      `Batch analysis complete: ${this.completedFiles} completed, ${this.errorFiles} errors`,
    );
  }

  getProcessingStatus(): ProcessingStatusDto {
    const total = this.totalFiles;
    const completed = this.completedFiles;
    const errors = this.errorFiles;
    const running = this.isProcessing;
    const processed = completed + errors;

    const progress = total > 0 ? (processed / total) * 100 : 0;

    // Calculate elapsed time
    let elapsedSeconds = 0;
    let estimatedSecondsRemaining = 0;
    let averageSecondsPerFile = 0;

    if (this.startTime && running) {
      elapsedSeconds = Math.floor(
        (Date.now() - this.startTime.getTime()) / 1000,
      );

      // Estimate remaining time based on average processing time
      if (processed > 0) {
        averageSecondsPerFile = elapsedSeconds / processed;
        const remaining = total - processed;
        estimatedSecondsRemaining = Math.ceil(
          averageSecondsPerFile * remaining,
        );
      }
    }

    return {
      isRunning: running,
      totalFiles: total,
      completedFiles: completed,
      errorFiles: errors,
      currentFile: this.currentFile,
      completed: !running && total > 0 && processed === total,
      progressPercent: progress,
      elapsedSeconds,
      estimatedSecondsRemaining,
      averageSecondsPerFile: Math.round(averageSecondsPerFile * 10) / 10,
    };
  }

  getPendingFiles(): string[] {
    return this.scanFolder()
      .filter((f) => f.status === "PENDING")
      .map((f) => f.fileName);
  }

  private formatForDisplay(timeStr: string | null): string | null {
    if (!timeStr) return null;
    try {
      return dayjs(timeStr).format("MMM D, YYYY h:mm A");
    } catch {
      return timeStr;
    }
  }
}
