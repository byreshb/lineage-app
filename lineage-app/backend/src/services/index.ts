import { Repositories } from '../repositories/index.js';
import { MetadataService } from './metadata.service.js';
import { LineageService } from './lineage.service.js';
import { RdlService } from './rdl.service.js';
import { AnalyzerService } from './analyzer.service.js';
import { HtmlExportService } from './html-export.service.js';
import { PbiLineageService } from './pbi-lineage.service.js';
import { CsvExportService } from './csv-export.service.js';

export { MetadataService } from './metadata.service.js';
export { LineageService } from './lineage.service.js';
export { RdlService } from './rdl.service.js';
export { AnalyzerService } from './analyzer.service.js';
export { HtmlExportService } from './html-export.service.js';
export { PbiLineageService } from './pbi-lineage.service.js';
export { CsvExportService } from './csv-export.service.js';

export interface Services {
  metadata: MetadataService;
  lineage: LineageService;
  rdl: RdlService;
  analyzer: AnalyzerService;
  htmlExport: HtmlExportService;
  pbiLineage: PbiLineageService;
  csvExport: CsvExportService;
}

export function createServices(repos: Repositories): Services {
  const lineage = new LineageService(repos);
  const analyzer = new AnalyzerService(repos);
  const metadata = new MetadataService(repos);
  const rdl = new RdlService(repos, lineage);
  const pbiLineage = new PbiLineageService(repos);
  const htmlExport = new HtmlExportService(repos, lineage, pbiLineage);
  const csvExport = new CsvExportService(repos);

  return {
    metadata,
    lineage,
    rdl,
    analyzer,
    htmlExport,
    pbiLineage,
    csvExport,
  };
}
