import axios from 'axios'

const API_BASE = '/api'

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
})

// App Config API
export const getAppConfig = () => {
  return api.get('/metadata/app-config')
}

// Metadata API
export const loadMetadata = (csvFolder = null) => {
  const params = csvFolder ? { csvFolder } : {}
  return api.post('/metadata/load', null, { params })
}

export const getMetadataStatus = () => {
  return api.get('/metadata/status')
}

// RDL File API
export const scanFolder = (folderPath = null, filter = null) => {
  const params = {}
  if (folderPath) params.folderPath = folderPath
  if (filter) params.filter = filter
  return api.get('/rdl/scan', { params })
}

export const analyzeFile = (fileName) => {
  return api.post(`/rdl/${encodeURIComponent(fileName)}/analyze`)
}

export const analyzeAll = () => {
  return api.post('/rdl/analyze-all')
}

export const getProcessingStatus = () => {
  return api.get('/rdl/processing-status')
}

// RDL Database/CSV Source API
export const getRdlSourceStatus = () => {
  return api.get('/rdl/source-status')
}

export const loadRdlFromDatabase = () => {
  return api.post('/rdl/load-database')
}

export const scanFromDatabase = (filter = null) => {
  const params = filter ? { filter } : {}
  return api.get('/rdl/scan-database', { params })
}

export const analyzeFromDatabase = (filePath) => {
  return api.post('/rdl/database/analyze', { filePath })
}

export const analyzeAllFromDatabase = (filter = null) => {
  const params = filter ? { filter } : {}
  return api.post('/rdl/analyze-all-database', null, { params })
}

// Reports/Lineage API
export const getReports = () => {
  return api.get('/reports')
}

export const getReport = (id) => {
  return api.get(`/reports/${id}`)
}

export const getLineage = (reportId) => {
  return api.get(`/reports/${reportId}/lineage`)
}

export const getSourceTables = (reportId) => {
  return api.get(`/reports/${reportId}/tables`)
}

// Entity Details API (for viewing definitions)
// Pass name as query param for reliable lookup (IDs may become stale after metadata reload)
export const getStoredProcedure = (id, name = null) => {
  const params = name ? { name } : {}
  return api.get(`/reports/procs/${id}`, { params })
}

export const getView = (id, name = null) => {
  const params = name ? { name } : {}
  return api.get(`/reports/views/${id}`, { params })
}

export const getSharedDataset = (id, name = null) => {
  const params = name ? { name } : {}
  return api.get(`/reports/shared-datasets/${id}`, { params })
}

export const getDataSources = (reportId) => {
  return api.get(`/reports/${reportId}/datasources`)
}

// Get recent executions with parameters
export const getReportExecutions = (reportId, limit = 20) => {
  return api.get(`/reports/${reportId}/executions`, { params: { limit } })
}

// Export lineage to CSV
export const exportLineageCsv = (reportId) => {
  return api.get(`/reports/${reportId}/export`, { responseType: 'blob' })
}

export const exportAllLineageCsv = () => {
  return api.get('/reports/export-all', { responseType: 'blob' })
}

// Export lineage to HTML
export const exportLineageHtml = (reportId) => {
  return api.get(`/reports/${reportId}/export-html`, { responseType: 'blob' })
}

// Export all lineage to HTML
export const exportAllHtml = () => {
  return api.get('/reports/export-all-html', { responseType: 'blob' })
}

// Power BI API
export const loadPbiData = () => {
  return api.post('/pbi/load')
}

export const getPbiStatus = () => {
  return api.get('/pbi/status')
}

export const getPbiReports = () => {
  return api.get('/pbi/reports')
}

export const getPbiReport = (id) => {
  return api.get(`/pbi/reports/${id}`)
}

export const getPbiLineage = (id) => {
  return api.get(`/pbi/reports/${id}/lineage`)
}

export const buildPbiLineage = (id) => {
  return api.post(`/pbi/reports/${id}/build-lineage`)
}

export const getPbiTables = (id) => {
  return api.get(`/pbi/reports/${id}/tables`)
}

export const getPbiExternalSources = (id) => {
  return api.get(`/pbi/reports/${id}/external-sources`)
}

export const exportPbiCsv = (id) => {
  return api.get(`/pbi/reports/${id}/export`, { responseType: 'blob' })
}

export const exportAllPbiCsv = () => {
  return api.get('/pbi/export-all', { responseType: 'blob' })
}

export const exportStarredPbiCsv = () => {
  return api.get('/pbi/export-starred', { responseType: 'blob' })
}

export const togglePbiStar = (id) => {
  return api.post(`/pbi/reports/${id}/star`)
}

export const exportPbiAllHtml = () => {
  return api.get('/pbi/export-all-html', { responseType: 'blob' })
}

export const exportPbiStarredHtml = () => {
  return api.get('/pbi/export-starred-html', { responseType: 'blob' })
}

// Unified CSV export
export const exportUnifiedCsv = (scope = 'both') => {
  return api.get(`/reports/unified-export?scope=${scope}`, { responseType: 'blob' })
}

// Unified Excel export (3 sheets: Lineage, Custom Tables by Report, Unique Custom Tables)
export const exportUnifiedExcel = (scope = 'both', starred = false) => {
  return api.get(`/reports/unified-export-excel?scope=${scope}&starred=${starred}`, { responseType: 'blob' })
}

// Export custom tables by report (tables ending with "+")
export const exportCustomTablesByReport = (scope = 'both', starred = false) => {
  return api.get(`/reports/custom-tables-by-report/export?scope=${scope}&starred=${starred}`, { responseType: 'blob' })
}

// Export unique custom tables (tables ending with "+")
export const exportUniqueCustomTablesCsv = (scope = 'both', starred = false) => {
  return api.get(`/reports/unique-custom-tables/export?scope=${scope}&starred=${starred}`, { responseType: 'blob' })
}

// Starring API
export const toggleStar = (reportId) => {
  return api.post(`/reports/${reportId}/star`)
}

export const getStarredReports = () => {
  return api.get('/reports/starred')
}

export const getStarredCount = () => {
  return api.get('/reports/starred/count')
}

export const exportStarredCsv = () => {
  return api.get('/reports/starred/export-csv', { responseType: 'blob' })
}

export const exportStarredHtml = () => {
  return api.get('/reports/starred/export-html', { responseType: 'blob' })
}

export const exportAllStarredCsv = () => {
  return api.get('/reports/starred/export-all-csv', { responseType: 'blob' })
}

export const exportCustomTablesFromStarred = () => {
  return api.get('/reports/starred/custom-tables/export', { responseType: 'blob' })
}

export const exportReportTableMapping = () => {
  return api.get('/reports/starred/report-table-mapping/export', { responseType: 'blob' })
}

export const exportUniqueTableColumns = () => {
  return api.get('/reports/starred/unique-table-columns/export', { responseType: 'blob' })
}

// Linked Reports API (Type 4 SSRS reports)
export const searchLinkedReports = (searchTerm) => {
  return api.get('/metadata/linked-reports/search', { params: { q: searchTerm } })
}

export const getAllLinkedReports = () => {
  return api.get('/metadata/linked-reports')
}

export const toggleLinkedReportStar = (id) => {
  return api.post(`/metadata/linked-reports/${id}/star`)
}

export const getStarredLinkedReports = () => {
  return api.get('/metadata/linked-reports/starred')
}

export const getStarredLinkedReportsCount = () => {
  return api.get('/metadata/linked-reports/starred/count')
}

// Custom Field Finder (CFF) - columns from custom tables (ending with "+")
export const exportCffCsv = () => {
  return api.get('/reports/cff/export', { responseType: 'blob' })
}

export default {
  getAppConfig,
  loadMetadata,
  getMetadataStatus,
  scanFolder,
  analyzeFile,
  analyzeAll,
  getProcessingStatus,
  getRdlSourceStatus,
  loadRdlFromDatabase,
  scanFromDatabase,
  analyzeFromDatabase,
  analyzeAllFromDatabase,
  getReports,
  getReport,
  getLineage,
  getSourceTables,
  getStoredProcedure,
  getView,
  getSharedDataset,
  getDataSources,
  getReportExecutions,
  exportLineageCsv,
  exportAllLineageCsv,
  exportLineageHtml,
  exportAllHtml,
  // Power BI
  loadPbiData,
  getPbiStatus,
  getPbiReports,
  getPbiReport,
  getPbiLineage,
  buildPbiLineage,
  getPbiTables,
  getPbiExternalSources,
  exportPbiCsv,
  exportAllPbiCsv,
  exportStarredPbiCsv,
  togglePbiStar,
  exportPbiAllHtml,
  exportPbiStarredHtml,
  // Unified export
  exportUnifiedCsv,
  exportUnifiedExcel,
  // Starring
  toggleStar,
  getStarredReports,
  getStarredCount,
  exportStarredCsv,
  exportStarredHtml,
  exportAllStarredCsv,
  // Linked Reports
  searchLinkedReports,
  getAllLinkedReports,
  toggleLinkedReportStar,
  getStarredLinkedReports,
  getStarredLinkedReportsCount,
  // Custom tables export
  exportCustomTablesFromStarred,
  // Table columns export
  exportReportTableMapping,
  exportUniqueTableColumns,
  // Custom tables CSV exports
  exportCustomTablesByReport,
  exportUniqueCustomTablesCsv,
  // Custom Field Finder (CFF)
  exportCffCsv
}
