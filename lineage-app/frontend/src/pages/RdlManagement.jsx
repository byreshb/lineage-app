import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/lineageApi'
import RdlFileList from '../components/RdlFileList'
import ProcessingProgress from '../components/ProcessingProgress'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

// Component to show CSV file details with expandable SQL
function CsvRow({ file, purpose, sql }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sql)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <>
      <tr className="csv-row" onClick={() => setExpanded(!expanded)}>
        <td>
          <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
          <code>{file}</code>
        </td>
        <td>{purpose}</td>
      </tr>
      {expanded && (
        <tr className="sql-row">
          <td colSpan="2">
            <div className="sql-container">
              <div className="sql-header">
                <span>SQL Query (run in SSMS):</span>
                <button
                  className={`copy-btn ${copied ? 'copied' : ''}`}
                  onClick={(e) => { e.stopPropagation(); handleCopy(); }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="sql-code">{sql}</pre>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function RdlManagement() {
  const navigate = useNavigate()
  const [metadataStatus, setMetadataStatus] = useState(null)
  const [metadataExpanded, setMetadataExpanded] = useState(false)
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState(null)
  const [isLocalProcessing, setIsLocalProcessing] = useState(false) // Local (filtered) vs backend (all)

  // RDL Source state
  const [rdlSource, setRdlSource] = useState('DATABASE') // 'FILES' or 'DATABASE' - default to DATABASE since file-based is disabled
  const [sourceStatus, setSourceStatus] = useState({ filesAvailable: false, databaseAvailable: false, databaseCount: 0 })
  const [showExportHelp, setShowExportHelp] = useState(false)

  // Filtering state
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Execution history filters
  const [execFilters, setExecFilters] = useState({
    hideNeverRan: false,
    hideStale: false,       // Not run in 30+ days
    hideAlwaysError: false, // 0 success, >0 errors
    onlySubscription: false,
  })

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // Export state
  const [exportingHtml, setExportingHtml] = useState(false)

  // Load initial data
  useEffect(() => {
    loadMetadataStatus()
    loadSourceStatus()
    loadFiles()
  }, [])

  // Reload files when source changes
  useEffect(() => {
    loadFiles()
  }, [rdlSource])

  const loadSourceStatus = async () => {
    try {
      const response = await api.getRdlSourceStatus()
      setSourceStatus(response.data)
    } catch (err) {
      console.error('Error loading source status:', err)
    }
  }

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter, pageSize, execFilters])

  // Poll for processing status when running (only for backend processing, not local)
  useEffect(() => {
    let interval = null
    let pollCount = 0

    // Skip polling if we're doing local processing (filtered files processed in frontend)
    if (isProcessing && !isLocalProcessing) {
      const fetchStatus = async () => {
        pollCount++
        try {
          const response = await api.getProcessingStatus()
          const status = response.data

          // Always update the status display
          setProcessingStatus(status)

          // Calculate if we're done
          const processed = (status.completedFiles || 0) + (status.errorFiles || 0)
          const total = status.totalFiles || 0

          // We're done when:
          // 1. Backend says completed, OR
          // 2. Backend is not running AND we've polled at least 3 times (give backend time to start), OR
          // 3. All files are processed
          const isDone = status.completed ||
            (!status.isRunning && pollCount >= 3) ||
            (total > 0 && processed >= total)

          if (isDone) {
            clearInterval(interval)
            // Small delay to show final state
            setTimeout(() => {
              setIsProcessing(false)
              loadFiles()
            }, 500)
          }
        } catch (err) {
          console.error('Error polling status:', err)
        }
      }

      // Start polling after a short delay to let backend initialize
      const startDelay = setTimeout(() => {
        fetchStatus()
        interval = setInterval(fetchStatus, 500)
      }, 200)

      return () => {
        clearTimeout(startDelay)
        if (interval) clearInterval(interval)
      }
    }
  }, [isProcessing, isLocalProcessing])

  // Filter and paginate files
  const filteredFiles = useMemo(() => {
    return files.filter(file => {
      // Filter by search term
      const matchesSearch = searchTerm === '' ||
        file.fileName.toLowerCase().includes(searchTerm.toLowerCase())

      // Filter by status
      const matchesStatus = statusFilter === 'ALL' || file.status === statusFilter

      // Execution history filters
      if (execFilters.hideNeverRan && file.neverRan === true) {
        return false
      }
      if (execFilters.hideStale && file.daysSinceLastRun !== null && file.daysSinceLastRun >= 30) {
        return false
      }
      if (execFilters.hideAlwaysError && file.successCount === 0 && file.errorCount > 0) {
        return false
      }
      if (execFilters.onlySubscription && (file.subscriptionCount === undefined || file.subscriptionCount === 0)) {
        return false
      }

      return matchesSearch && matchesStatus
    })
  }, [files, searchTerm, statusFilter, execFilters])

  const paginatedFiles = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredFiles.slice(startIndex, startIndex + pageSize)
  }, [filteredFiles, currentPage, pageSize])

  const totalPages = Math.ceil(filteredFiles.length / pageSize)

  // Status counts for filter badges
  const statusCounts = useMemo(() => {
    return files.reduce((acc, file) => {
      acc[file.status] = (acc[file.status] || 0) + 1
      return acc
    }, {})
  }, [files])

  // Execution history counts
  const execCounts = useMemo(() => {
    const counts = {
      neverRan: 0,
      stale: 0,
      alwaysError: 0,
      subscription: 0,
      hasExecData: 0,
    }
    for (const file of files) {
      if (file.executionCount !== undefined) {
        counts.hasExecData++
        if (file.neverRan) counts.neverRan++
        if (file.daysSinceLastRun !== null && file.daysSinceLastRun >= 30) counts.stale++
        if (file.successCount === 0 && file.errorCount > 0) counts.alwaysError++
        if (file.subscriptionCount > 0) counts.subscription++
      }
    }
    return counts
  }, [files])

  const handleExecFilterChange = (filterName) => {
    setExecFilters(prev => ({
      ...prev,
      [filterName]: !prev[filterName]
    }))
  }

  const loadMetadataStatus = async () => {
    try {
      const response = await api.getMetadataStatus()
      setMetadataStatus(response.data)
    } catch (err) {
      console.error('Error loading metadata status:', err)
    }
  }

  const loadFiles = async () => {
    try {
      setLoading(true)
      let response
      if (rdlSource === 'DATABASE') {
        response = await api.scanFromDatabase()
      } else {
        response = await api.scanFolder()
      }
      setFiles(response.data)
      setError(null)
    } catch (err) {
      setError(`Error scanning ${rdlSource === 'DATABASE' ? 'database' : 'folder'}: ` + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLoadRdlDatabase = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.loadRdlFromDatabase()
      if (response.data.success) {
        await loadSourceStatus()
        if (rdlSource === 'DATABASE') {
          await loadFiles()
        }
      } else {
        setError(response.data.message)
      }
    } catch (err) {
      setError('Error loading RDL from database: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLoadMetadata = async () => {
    try {
      setLoading(true)
      setError(null)
      await api.loadMetadata()
      await loadMetadataStatus()
    } catch (err) {
      setError('Error loading metadata: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleScan = async () => {
    await loadFiles()
  }

  const handleRunSingle = async (file) => {
    try {
      setError(null)
      // Update file status to PROCESSING
      setFiles(prev => prev.map(f =>
        f.fileName === file.fileName ? { ...f, status: 'PROCESSING' } : f
      ))

      if (rdlSource === 'DATABASE') {
        await api.analyzeFromDatabase(file.filePath)
      } else {
        await api.analyzeFile(file.fileName)
      }
      await loadFiles() // Refresh to get updated status
    } catch (err) {
      setError('Error analyzing file: ' + err.message)
      await loadFiles()
    }
  }

  const handleRunAll = async () => {
    try {
      setError(null)

      // Get the filtered files to process - recompute to ensure we have latest
      const filesToProcess = files.filter(file => {
        const matchesSearch = searchTerm === '' ||
          file.fileName.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesStatus = statusFilter === 'ALL' || file.status === statusFilter

        // Execution history filters
        if (execFilters.hideNeverRan && file.neverRan === true) {
          return false
        }
        if (execFilters.hideStale && file.daysSinceLastRun !== null && file.daysSinceLastRun >= 30) {
          return false
        }
        if (execFilters.hideAlwaysError && file.successCount === 0 && file.errorCount > 0) {
          return false
        }
        if (execFilters.onlySubscription && (file.subscriptionCount === undefined || file.subscriptionCount === 0)) {
          return false
        }

        return matchesSearch && matchesStatus
      })

      console.log('Filter state:', execFilters)
      console.log('Total files:', files.length)
      console.log('Filtered files to process:', filesToProcess.length)
      console.log('Files with neverRan=true:', files.filter(f => f.neverRan === true).length)

      if (filesToProcess.length === 0) {
        setError('No files to process with current filters')
        return
      }

      // Set initial status immediately so progress bar shows
      setProcessingStatus({
        isRunning: true,
        totalFiles: filesToProcess.length,
        completedFiles: 0,
        errorFiles: 0,
        currentFile: 'Starting...',
        completed: false,
        progressPercent: 0,
        elapsedSeconds: 0,
        estimatedSecondsRemaining: 0,
        averageSecondsPerFile: 0
      })
      setIsLocalProcessing(true) // Processing filtered files locally
      setIsProcessing(true)

      // Process each filtered file individually
      for (const file of filesToProcess) {
        setProcessingStatus(prev => ({
          ...prev,
          currentFile: file.fileName
        }))
        try {
          if (rdlSource === 'DATABASE') {
            await api.analyzeFromDatabase(file.filePath)
          } else {
            await api.analyzeFile(file.fileName)
          }
          setProcessingStatus(prev => ({
            ...prev,
            completedFiles: prev.completedFiles + 1,
            progressPercent: ((prev.completedFiles + 1) / filesToProcess.length) * 100
          }))
        } catch (err) {
          console.error(`Error processing ${file.fileName}:`, err)
          setProcessingStatus(prev => ({
            ...prev,
            errorFiles: prev.errorFiles + 1
          }))
        }
      }

      // Done
      setProcessingStatus(prev => ({
        ...prev,
        completed: true,
        isRunning: false,
        currentFile: ''
      }))
      setIsProcessing(false)
      setIsLocalProcessing(false)
      await loadFiles()
    } catch (err) {
      setError('Error during batch analysis: ' + err.message)
      setIsProcessing(false)
      setIsLocalProcessing(false)
    }
  }

  const handlePageChange = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  const handleViewLineage = (file) => {
    // Navigate to the lineage viewer page
    if (file.reportId) {
      navigate(`/lineage/${file.reportId}`)
    }
  }

  const handleExportAllHtml = async () => {
    try {
      setExportingHtml(true)
      const response = await api.exportAllHtml()
      const blob = new Blob([response.data], { type: 'text/html' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'lineage-all-reports.html'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError('Error exporting HTML: ' + err.message)
    } finally {
      setExportingHtml(false)
    }
  }

  const handleExportAllCsv = async () => {
    try {
      const response = await api.exportAllLineageCsv()
      const url = window.URL.createObjectURL(response.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'lineage-all-reports.csv'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      setError('Error exporting CSV: ' + err.message)
    }
  }

  return (
    <div className="rdl-management">
      <section className="metadata-section">
        <h2>Metadata</h2>
        <div className="metadata-controls">
          <button
            onClick={handleLoadMetadata}
            disabled={loading}
            className="btn btn-primary"
          >
            Load Metadata
          </button>

          {metadataStatus && metadataStatus.loaded && (
            <div className="metadata-status">
              <span className="status-badge success">Metadata loaded</span>
              <button
                className="metadata-toggle"
                onClick={() => setMetadataExpanded(!metadataExpanded)}
              >
                {metadataExpanded ? '▼' : '▶'} Details
              </button>
              {metadataStatus.loadedAt && (
                <span className="metadata-time">Loaded: {metadataStatus.loadedAt}</span>
              )}
            </div>
          )}

          {metadataStatus && !metadataStatus.loaded && (
            <div className="metadata-status">
              <span className="status-badge warning">Metadata not loaded</span>
              <span className="metadata-hint">Click "Load Metadata" to load CSV files</span>
            </div>
          )}
        </div>

        {metadataStatus && metadataStatus.loaded && metadataExpanded && (
          <div className="metadata-details">
            <p className="csv-intro">Click on any row to see the SQL query used to extract the data:</p>
            <table className="csv-details-table">
              <thead>
                <tr>
                  <th>CSV File</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                <CsvRow
                  file="sysproreporting_stored_procs.csv"
                  purpose="All stored procedures in SysproReporting database (all schemas). Contains the SQL code so we can find which tables they read from."
                  sql={`-- Run on SysproReporting database (D300SQLDW01)
USE [SysproReporting];

SELECT
    s.name AS SchemaName,
    o.name AS ProcName,
    m.definition AS ProcDefinition
FROM sys.sql_modules m
INNER JOIN sys.objects o ON m.object_id = o.object_id
INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
WHERE o.type = 'P'
ORDER BY s.name, o.name;`}
                />
                <CsvRow
                  file="all_views.csv"
                  purpose="View names and SQL definitions. Used to recursively trace view dependencies to base tables."
                  sql={`-- Run on SysproReporting database (D300SQLDW01)
USE [SysproReporting];

SELECT
    s.name AS SchemaName,
    o.name AS ViewName,
    m.definition AS ViewDefinition
FROM sys.sql_modules m
INNER JOIN sys.objects o ON m.object_id = o.object_id
INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
WHERE o.type_desc = 'VIEW'
ORDER BY s.name, o.name;`}
                />
                <CsvRow
                  file="tables_with_pks.csv"
                  purpose="All tables across all accessible databases with server name and primary key status."
                  sql={`-- All tables from ALL accessible databases with server name
DECLARE @SQL NVARCHAR(MAX) = '';
DECLARE @First BIT = 1;

SELECT @SQL = @SQL +
    CASE WHEN @First = 1 THEN '' ELSE ' UNION ALL ' END +
    'SELECT @@SERVERNAME AS ServerName,
        ''' + name + ''' AS DatabaseName,
        s.name COLLATE Latin1_General_CI_AS AS SchemaName,
        t.name COLLATE Latin1_General_CI_AS AS TableName,
        CASE WHEN kc.object_id IS NOT NULL THEN ''Yes'' ELSE ''No'' END AS HasPK
    FROM [' + name + '].sys.tables t
    INNER JOIN [' + name + '].sys.schemas s ON t.schema_id = s.schema_id
    LEFT JOIN [' + name + '].sys.key_constraints kc ON t.object_id = kc.parent_object_id AND kc.type = ''PK''
    WHERE t.is_ms_shipped = 0',
    @First = 0
FROM sys.databases
WHERE database_id > 4
  AND state = 0
  AND HAS_DBACCESS(name) = 1
  AND name NOT IN ('ReportServer', 'ReportServerTempDB')
ORDER BY name;

SET @SQL = @SQL + ' ORDER BY ServerName, DatabaseName, SchemaName, TableName';

EXEC sp_executesql @SQL;`}
                />
                <CsvRow
                  file="shared_datasets.csv"
                  purpose="SSRS SharedDataset definitions from ReportServer. Contains actual SQL queries behind shared datasets."
                  sql={`-- Run on ReportServer database (D300SQLDW01)
USE [ReportServer];

SELECT
    c.Name AS dataset_name,
    c.Path AS dataset_path,
    x.value('(//rd:CommandType)[1]', 'nvarchar(50)') AS command_type,
    x.value('(//rd:CommandText)[1]', 'nvarchar(max)') AS command_text
FROM dbo.Catalog c
CROSS APPLY (
    SELECT CAST(CAST(c.Content AS varbinary(max)) AS xml) AS x
) AS parsed
CROSS APPLY parsed.x.nodes('/*') AS T(x)
WHERE c.Type = 8  -- Type 8 = SharedDataset
ORDER BY c.Path, c.Name;`}
                />
                <CsvRow
                  file="linked_servers.csv"
                  purpose="Linked server alias mappings. Used to resolve 4-part table names (e.g., SYSPRO.db.dbo.Table)."
                  sql={`-- Run on SysproReporting database (D300SQLDW01)
SELECT
    name AS LinkedServerName,
    data_source AS ServerAddress,
    provider
FROM sys.servers
WHERE is_linked = 1;`}
                />
                <CsvRow
                  file="dependencies.csv"
                  purpose="Shows what tables/views each stored proc uses. SQL Server tracks this automatically. We compare this with our regex parsing to catch more dependencies."
                  sql={`-- Run on SysproReporting database (D300SQLDW01)
USE [SysproReporting];

SELECT
    s.name AS ObjectSchema,
    o.name AS ObjectName,
    o.type_desc AS ObjectType,
    dep_s.name AS DependsOnSchema,
    dep_o.name AS DependsOnName,
    dep_o.type_desc AS DependsOnType
FROM sys.sql_expression_dependencies d
INNER JOIN sys.objects o ON d.referencing_id = o.object_id
INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
LEFT JOIN sys.objects dep_o ON d.referenced_id = dep_o.object_id
LEFT JOIN sys.schemas dep_s ON dep_o.schema_id = dep_s.schema_id
ORDER BY s.name, o.name;`}
                />
                <CsvRow
                  file="shared_datasources.csv"
                  purpose="SSRS shared data source connection strings. Maps data source paths to actual server/database."
                  sql={`-- Run on ReportServer database (D300SQLDW01)
USE [ReportServer];

SELECT
    c.Name AS DataSourceName,
    c.Path AS DataSourcePath,
    x.value('(/*:DataSourceDefinition/*:ConnectString)[1]', 'nvarchar(max)') AS ConnectionString,
    x.value('(/*:DataSourceDefinition/*:Extension)[1]', 'nvarchar(100)') AS Extension
FROM dbo.Catalog c
CROSS APPLY (SELECT CAST(CAST(c.Content AS VARBINARY(MAX)) AS XML) AS x) AS parsed
WHERE c.Type = 5  -- Type 5 = DataSource
ORDER BY c.Path, c.Name;`}
                />
                <CsvRow
                  file="rdl_reports.txt"
                  purpose="RDL report definitions exported from ReportServer. Contains full XML content of each report. Use tab-delimited export!"
                  sql={`-- Run on ReportServer database (D300SQLDW01)
-- IMPORTANT: Export as TAB-DELIMITED (.txt), NOT CSV!
-- SSMS: Tools → Options → Query Results → Results to Text → Tab Delimited
USE [ReportServer];

SELECT
    Name AS ReportName,
    Path AS ReportPath,
    CONVERT(VARCHAR(23), CreationDate, 121) AS CreationDate,
    CONVERT(VARCHAR(23), ModifiedDate, 121) AS ModifiedDate,
    CONVERT(NVARCHAR(MAX), CAST(CAST(Content AS VARBINARY(MAX)) AS XML)) AS RdlContent
FROM Catalog
WHERE Type = 2  -- Type 2 = Reports
ORDER BY Path, Name;`}
                />
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rdl-section">
        <div className="section-header">
          <h2>RDL Reports ({files.length} total)</h2>
          <div className="section-controls">
            {/* Source Toggle */}
            <div className="source-toggle">
              <label className="toggle-label">Source:</label>
              <button
                className={`toggle-btn ${rdlSource === 'FILES' ? 'active' : ''}`}
                onClick={() => setRdlSource('FILES')}
                disabled={!sourceStatus.filesAvailable}
                title={sourceStatus.filesAvailable ? 'Load from physical RDL files' : 'RDL folder not found'}
              >
                Files
              </button>
              <button
                className={`toggle-btn ${rdlSource === 'DATABASE' ? 'active' : ''}`}
                onClick={() => setRdlSource('DATABASE')}
                disabled={!sourceStatus.databaseAvailable}
                title={sourceStatus.databaseAvailable ? `Load from rdl_reports.csv (${sourceStatus.databaseCount} reports)` : 'rdl_reports.csv not found'}
              >
                Database {sourceStatus.databaseCount > 0 && `(${sourceStatus.databaseCount})`}
              </button>
              {rdlSource === 'DATABASE' && (
                <button
                  onClick={handleLoadRdlDatabase}
                  disabled={loading}
                  className="btn btn-sm"
                  title="Reload RDL reports from CSV"
                >
                  Reload RDL Reports
                </button>
              )}
              <button
                className="btn btn-sm btn-help"
                onClick={() => setShowExportHelp(!showExportHelp)}
                title="How to export RDL reports from SQL Server"
              >
                ?
              </button>
            </div>

            <button onClick={handleScan} disabled={loading} className="btn">
              Scan
            </button>
            <button
              onClick={handleRunAll}
              disabled={loading || isProcessing || filteredFiles.length === 0}
              className="btn btn-primary"
            >
              {filteredFiles.length === files.length
                ? `Run All (${files.length})`
                : `Run Filtered (${filteredFiles.length})`}
            </button>
            <button
              onClick={handleExportAllHtml}
              disabled={loading || isProcessing || exportingHtml || (statusCounts.COMPLETED || 0) === 0}
              className="btn btn-secondary"
              title="Export all completed reports as interactive HTML"
            >
              {exportingHtml ? 'Exporting...' : `Export HTML (${statusCounts.COMPLETED || 0})`}
            </button>
            <button
              onClick={handleExportAllCsv}
              disabled={loading || isProcessing || (statusCounts.COMPLETED || 0) === 0}
              className="btn btn-secondary"
              title="Export all completed reports lineage as CSV"
            >
              Export CSV ({statusCounts.COMPLETED || 0})
            </button>
          </div>
        </div>

        {showExportHelp && (
          <div className="export-help-box">
            <h4>How to Export RDL Reports from SQL Server</h4>
            <p className="help-warning">
              <strong>Important:</strong> Export as <strong>TAB-delimited</strong> (.txt), NOT CSV!
              RDL content contains XML with commas that will break CSV parsing.
            </p>

            <div className="help-steps">
              <h5>SSMS Export Settings (one-time setup):</h5>
              <ol>
                <li>Go to <strong>Tools → Options</strong></li>
                <li>Navigate to <strong>Query Results → SQL Server → Results to Text</strong></li>
                <li>Set <strong>"Output format"</strong> to <strong>Tab Delimited</strong></li>
                <li>Check <strong>"Include column headers in the result set"</strong></li>
                <li>Click OK</li>
              </ol>

              <h5>To Export:</h5>
              <ol>
                <li>Run the SQL query below in SSMS</li>
                <li>Press <strong>Ctrl+Shift+F</strong> (Results to File) before executing</li>
                <li>Save as <strong>rdl_reports.txt</strong> in the <code>data/</code> folder</li>
              </ol>
            </div>

            <div className="sql-container">
              <div className="sql-header">
                <span>SQL Query (ReportServer database):</span>
                <button
                  className="copy-btn"
                  onClick={async () => {
                    const sql = `USE [ReportServer];

SELECT
    Name AS ReportName,
    Path AS ReportPath,
    CONVERT(VARCHAR(23), CreationDate, 121) AS CreationDate,
    CONVERT(VARCHAR(23), ModifiedDate, 121) AS ModifiedDate,
    CONVERT(NVARCHAR(MAX), CAST(CAST(Content AS VARBINARY(MAX)) AS XML)) AS RdlContent
FROM Catalog
WHERE Type = 2  -- Reports only
ORDER BY Path, Name;`;
                    await navigator.clipboard.writeText(sql);
                  }}
                >
                  Copy
                </button>
              </div>
              <pre className="sql-code">{`USE [ReportServer];

SELECT
    Name AS ReportName,
    Path AS ReportPath,
    CONVERT(VARCHAR(23), CreationDate, 121) AS CreationDate,
    CONVERT(VARCHAR(23), ModifiedDate, 121) AS ModifiedDate,
    CONVERT(NVARCHAR(MAX), CAST(CAST(Content AS VARBINARY(MAX)) AS XML)) AS RdlContent
FROM Catalog
WHERE Type = 2  -- Reports only
ORDER BY Path, Name;`}</pre>
            </div>
          </div>
        )}

        {error && (
          <div className="error-message">{error}</div>
        )}

        {isProcessing && processingStatus && (
          <ProcessingProgress status={processingStatus} />
        )}

        {/* Combined Filters */}
        <div className="filters-bar">
          <div className="filters-row">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search by file name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              {searchTerm && (
                <button
                  className="clear-search"
                  onClick={() => setSearchTerm('')}
                >
                  &times;
                </button>
              )}
            </div>

            <div className="status-filters">
              <span className="filter-group-label">Status:</span>
              <button
                className={`filter-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setStatusFilter('ALL')}
              >
                All ({files.length})
              </button>
              <button
                className={`filter-btn pending ${statusFilter === 'PENDING' ? 'active' : ''}`}
                onClick={() => setStatusFilter('PENDING')}
              >
                Pending ({statusCounts.PENDING || 0})
              </button>
              <button
                className={`filter-btn completed ${statusFilter === 'COMPLETED' ? 'active' : ''}`}
                onClick={() => setStatusFilter('COMPLETED')}
              >
                Completed ({statusCounts.COMPLETED || 0})
              </button>
              <button
                className={`filter-btn error ${statusFilter === 'ERROR' ? 'active' : ''}`}
                onClick={() => setStatusFilter('ERROR')}
              >
                Error ({statusCounts.ERROR || 0})
              </button>
            </div>

            <div className="page-size-selector">
              <label>Show:</label>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Execution History Filters */}
          {execCounts.hasExecData > 0 && (
            <div className="filters-row exec-filters-row">
              <span className="filter-group-label">Execution:</span>
              <label className="exec-filter-checkbox" title="Reports that have never been executed by users">
                <input
                  type="checkbox"
                  checked={execFilters.hideNeverRan}
                  onChange={() => handleExecFilterChange('hideNeverRan')}
                />
                <span>Hide never ran ({execCounts.neverRan})</span>
              </label>
              <label className="exec-filter-checkbox" title="Reports not executed in the last 30 days">
                <input
                  type="checkbox"
                  checked={execFilters.hideStale}
                  onChange={() => handleExecFilterChange('hideStale')}
                />
                <span>Hide stale 30+ days ({execCounts.stale})</span>
              </label>
              <label className="exec-filter-checkbox" title="Reports with 0 successful runs and at least 1 error">
                <input
                  type="checkbox"
                  checked={execFilters.hideAlwaysError}
                  onChange={() => handleExecFilterChange('hideAlwaysError')}
                />
                <span>Hide always-error ({execCounts.alwaysError})</span>
              </label>
              <label className="exec-filter-checkbox" title="Only show reports that run via subscriptions">
                <input
                  type="checkbox"
                  checked={execFilters.onlySubscription}
                  onChange={() => handleExecFilterChange('onlySubscription')}
                />
                <span>Only subscription ({execCounts.subscription})</span>
              </label>
            </div>
          )}
        </div>

        {/* Results info */}
        <div className="results-info">
          Showing {paginatedFiles.length} of {filteredFiles.length} files
          {searchTerm && ` matching "${searchTerm}"`}
          {statusFilter !== 'ALL' && ` with status ${statusFilter}`}
        </div>

        <RdlFileList
          files={paginatedFiles}
          loading={loading}
          onRunSingle={handleRunSingle}
          onViewLineage={handleViewLineage}
          isProcessing={isProcessing}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="page-btn"
              disabled={currentPage === 1}
              onClick={() => handlePageChange(1)}
            >
              First
            </button>
            <button
              className="page-btn"
              disabled={currentPage === 1}
              onClick={() => handlePageChange(currentPage - 1)}
            >
              Prev
            </button>

            <div className="page-numbers">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }
                return (
                  <button
                    key={pageNum}
                    className={`page-btn ${currentPage === pageNum ? 'active' : ''}`}
                    onClick={() => handlePageChange(pageNum)}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>

            <button
              className="page-btn"
              disabled={currentPage === totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
            >
              Next
            </button>
            <button
              className="page-btn"
              disabled={currentPage === totalPages}
              onClick={() => handlePageChange(totalPages)}
            >
              Last
            </button>

            <span className="page-info">
              Page {currentPage} of {totalPages}
            </span>
          </div>
        )}
      </section>
    </div>
  )
}

export default RdlManagement
