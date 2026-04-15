import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
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

function ReportManagement() {
  const navigate = useNavigate()
  const location = useLocation()

  // Main tab state: 'SSRS' or 'PBI' - restored from navigation state
  const [activeTab, setActiveTab] = useState(
    location.state?.activeTab || 'SSRS'
  )

  // SSRS state
  const [metadataStatus, setMetadataStatus] = useState(null)
  const [metadataExpanded, setMetadataExpanded] = useState(false)
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState(null)
  const [isLocalProcessing, setIsLocalProcessing] = useState(false)
  const [rdlSource, setRdlSource] = useState('DATABASE')
  const [sourceStatus, setSourceStatus] = useState({ filesAvailable: false, databaseAvailable: false, databaseCount: 0 })
  const [showExportHelp, setShowExportHelp] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [execFilters, setExecFilters] = useState({
    hideNeverRan: false,
    hideStale: false,
    hideAlwaysError: false,
    onlySubscription: false,
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [exportingHtml, setExportingHtml] = useState(false)
  const [starredCount, setStarredCount] = useState(0)
  const [linkedStarredCount, setLinkedStarredCount] = useState(0)

  // PBI state
  const [pbiStatus, setPbiStatus] = useState({ loaded: false, reportCount: 0, tableCount: 0 })
  const [pbiReports, setPbiReports] = useState([])
  const [pbiLoading, setPbiLoading] = useState(false)
  const [pbiSearchTerm, setPbiSearchTerm] = useState('')
  const [pbiCurrentPage, setPbiCurrentPage] = useState(1)
  const [pbiStarredCount, setPbiStarredCount] = useState(0)

  // Export dropdown state
  const [showExportDropdown, setShowExportDropdown] = useState(false)

  // Linked reports state (Type 4 SSRS reports)
  const [linkedReportMatches, setLinkedReportMatches] = useState([])
  const [linkedReportLoading, setLinkedReportLoading] = useState(false)
  const [allLinkedReports, setAllLinkedReports] = useState([])

  // App config (features)
  const [appConfig, setAppConfig] = useState({ features: { enableFileBasedRdl: false, enablePowerBI: true } })

  // Load app config and initial data
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await api.getAppConfig()
        setAppConfig(response.data)
        // If file-based RDL is disabled, force DATABASE source
        if (!response.data.features?.enableFileBasedRdl) {
          setRdlSource('DATABASE')
        }
      } catch (err) {
        console.error('Error loading app config:', err)
      }
    }
    loadConfig()
    loadMetadataStatus()
    loadSourceStatus()
    loadFiles()
    loadPbiStatus()
    loadAllLinkedReports()
    loadStarredCount()
  }, [])

  // Reload files when source changes
  useEffect(() => {
    loadFiles()
  }, [rdlSource])

  // Reset to page 1 when filters or search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter, pageSize, execFilters])

  // Search linked reports when search term changes
  useEffect(() => {
    const searchLinked = async () => {
      if (searchTerm.length >= 2) {
        setLinkedReportLoading(true)
        try {
          const response = await api.searchLinkedReports(searchTerm)
          setLinkedReportMatches(response.data)
        } catch (err) {
          console.error('Error searching linked reports:', err)
          setLinkedReportMatches([])
        } finally {
          setLinkedReportLoading(false)
        }
      } else {
        setLinkedReportMatches([])
      }
    }
    const debounce = setTimeout(searchLinked, 300)
    return () => clearTimeout(debounce)
  }, [searchTerm])

  // Poll for processing status when running
  useEffect(() => {
    let interval = null
    let pollCount = 0

    if (isProcessing && !isLocalProcessing) {
      const fetchStatus = async () => {
        pollCount++
        try {
          const response = await api.getProcessingStatus()
          const status = response.data
          setProcessingStatus(status)
          const processed = (status.completedFiles || 0) + (status.errorFiles || 0)
          const total = status.totalFiles || 0
          const isDone = status.completed || (!status.isRunning && pollCount >= 3) || (total > 0 && processed >= total)
          if (isDone) {
            clearInterval(interval)
            setTimeout(() => {
              setIsProcessing(false)
              loadFiles()
            }, 500)
          }
        } catch (err) {
          console.error('Error polling status:', err)
        }
      }

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

  // Filter and paginate files (search applies to both linked reports and templates)
  const filteredFiles = useMemo(() => {
    return files.filter(file => {
      const matchesSearch = searchTerm.length < 2 || file.fileName.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = statusFilter === 'ALL' || file.status === statusFilter
      if (execFilters.hideNeverRan && file.neverRan === true) return false
      if (execFilters.hideStale && file.daysSinceLastRun !== null && file.daysSinceLastRun >= 30) return false
      if (execFilters.hideAlwaysError && file.successCount === 0 && file.errorCount > 0) return false
      if (execFilters.onlySubscription && (file.subscriptionCount === undefined || file.subscriptionCount === 0)) return false
      return matchesSearch && matchesStatus
    })
  }, [files, searchTerm, statusFilter, execFilters])

  // Combined results - includes linked reports only when status filter is ALL
  const combinedResults = useMemo(() => {
    // Use search matches when searching, otherwise all linked reports
    // But only include linked reports when status filter is ALL (linked reports don't have status)
    const linkedToUse = statusFilter === 'ALL'
      ? (searchTerm.length >= 2 ? linkedReportMatches : allLinkedReports)
      : []
    const linked = linkedToUse.map(lr => ({
      type: 'linked',
      id: `linked-${lr.id}`,
      name: lr.linkedReportName,
      path: lr.linkedReportPath,
      templatePath: lr.templatePath,
      linkedReport: lr,
    }))
    const templates = filteredFiles.map(file => ({
      type: 'template',
      id: `template-${file.fileName}`,
      name: file.fileName.replace('.rdl', ''),
      path: file.filePath || '-',
      templatePath: '-',
      file: file,
    }))
    return [...linked, ...templates]
  }, [searchTerm, linkedReportMatches, allLinkedReports, filteredFiles, statusFilter])

  // Paginated results
  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return combinedResults.slice(startIndex, startIndex + pageSize)
  }, [combinedResults, currentPage, pageSize])

  const totalPages = useMemo(() => {
    return Math.ceil(combinedResults.length / pageSize)
  }, [combinedResults.length, pageSize])

  const totalResults = combinedResults.length

  // Status counts
  const statusCounts = useMemo(() => {
    return files.reduce((acc, file) => {
      acc[file.status] = (acc[file.status] || 0) + 1
      return acc
    }, {})
  }, [files])

  const execCounts = useMemo(() => {
    const counts = { neverRan: 0, stale: 0, alwaysError: 0, subscription: 0, hasExecData: 0 }
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

  // PBI filtered and paginated
  const filteredPbiReports = useMemo(() => {
    if (!pbiSearchTerm) return pbiReports
    return pbiReports.filter(r => r.reportName.toLowerCase().includes(pbiSearchTerm.toLowerCase()))
  }, [pbiReports, pbiSearchTerm])

  const paginatedPbiReports = useMemo(() => {
    const startIndex = (pbiCurrentPage - 1) * pageSize
    return filteredPbiReports.slice(startIndex, startIndex + pageSize)
  }, [filteredPbiReports, pbiCurrentPage, pageSize])

  const pbiTotalPages = Math.ceil(filteredPbiReports.length / pageSize)

  // Handlers
  const handleExecFilterChange = (filterName) => {
    setExecFilters(prev => ({ ...prev, [filterName]: !prev[filterName] }))
  }

  const loadMetadataStatus = async () => {
    try {
      const response = await api.getMetadataStatus()
      setMetadataStatus(response.data)
    } catch (err) {
      console.error('Error loading metadata status:', err)
    }
  }

  const loadSourceStatus = async () => {
    try {
      const response = await api.getRdlSourceStatus()
      setSourceStatus(response.data)
    } catch (err) {
      console.error('Error loading source status:', err)
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

  const loadPbiStatus = async () => {
    try {
      const response = await api.getPbiStatus()
      setPbiStatus(response.data)
      if (response.data.loaded) {
        loadPbiReports()
      }
    } catch (err) {
      console.error('Error loading PBI status:', err)
    }
  }

  const loadPbiReports = async () => {
    try {
      setPbiLoading(true)
      const response = await api.getPbiReports()
      setPbiReports(response.data)
      // Count starred reports
      const starredCount = response.data.filter(r => r.starred).length
      setPbiStarredCount(starredCount)
    } catch (err) {
      console.error('Error loading PBI reports:', err)
    } finally {
      setPbiLoading(false)
    }
  }

  const loadAllLinkedReports = async () => {
    try {
      const response = await api.getAllLinkedReports()
      setAllLinkedReports(response.data)
    } catch (err) {
      console.error('Error loading linked reports:', err)
    }
  }

  const loadStarredCount = async () => {
    try {
      const response = await api.getStarredCount()
      setStarredCount(response.data.count)
    } catch (err) {
      console.error('Error loading starred count:', err)
    }
    try {
      const response = await api.getStarredLinkedReportsCount()
      setLinkedStarredCount(response.data.count)
    } catch (err) {
      console.error('Error loading linked starred count:', err)
    }
  }

  const handleToggleStar = async (file) => {
    try {
      const response = await api.toggleStar(file.reportId)
      // Update the file in state
      setFiles(prev => prev.map(f =>
        f.fileName === file.fileName ? { ...f, starred: response.data.starred } : f
      ))
      // Update starred count
      setStarredCount(prev => response.data.starred ? prev + 1 : prev - 1)
    } catch (err) {
      console.error('Error toggling star:', err)
    }
  }

  const handleToggleLinkedStar = async (linkedReport) => {
    try {
      const response = await api.toggleLinkedReportStar(linkedReport.id)
      // Update linked reports in state
      setAllLinkedReports(prev => prev.map(lr =>
        lr.id === linkedReport.id ? { ...lr, starred: response.data.starred } : lr
      ))
      setLinkedReportMatches(prev => prev.map(lr =>
        lr.id === linkedReport.id ? { ...lr, starred: response.data.starred } : lr
      ))
      // Update starred count
      setLinkedStarredCount(prev => response.data.starred ? prev + 1 : prev - 1)
    } catch (err) {
      console.error('Error toggling linked star:', err)
    }
  }

  const handleTogglePbiStar = async (report) => {
    try {
      const response = await api.togglePbiStar(report.id)
      // Update the report in state
      setPbiReports(prev => prev.map(r =>
        r.id === report.id ? { ...r, starred: response.data.starred } : r
      ))
      // Update starred count
      setPbiStarredCount(prev => response.data.starred ? prev + 1 : prev - 1)
    } catch (err) {
      console.error('Error toggling PBI star:', err)
    }
  }

  const handleLoadPbiData = async () => {
    try {
      setPbiLoading(true)
      setError(null)
      const response = await api.loadPbiData()
      if (response.data.success) {
        await loadPbiStatus()
        await loadPbiReports()
      } else {
        setError(response.data.message)
      }
    } catch (err) {
      setError('Error loading PBI data: ' + err.message)
    } finally {
      setPbiLoading(false)
    }
  }

  const handleRunStarredPbi = async () => {
    try {
      setError(null)
      const starredReports = pbiReports.filter(report => report.starred === true)

      if (starredReports.length === 0) {
        setError('No starred Power BI reports to process')
        return
      }

      setProcessingStatus({
        isRunning: true,
        totalFiles: starredReports.length,
        completedFiles: 0,
        errorFiles: 0,
        currentFile: 'Starting...',
        completed: false,
        progressPercent: 0,
      })
      setIsLocalProcessing(true)
      setIsProcessing(true)

      for (const report of starredReports) {
        setProcessingStatus(prev => ({ ...prev, currentFile: report.reportName }))
        try {
          await api.buildPbiLineage(report.id)
          setProcessingStatus(prev => ({
            ...prev,
            completedFiles: prev.completedFiles + 1,
            progressPercent: ((prev.completedFiles + 1) / starredReports.length) * 100
          }))
        } catch (err) {
          setProcessingStatus(prev => ({ ...prev, errorFiles: prev.errorFiles + 1 }))
        }
      }

      setProcessingStatus(prev => ({ ...prev, completed: true, isRunning: false, currentFile: '' }))
      setIsProcessing(false)
      setIsLocalProcessing(false)
      await loadPbiReports()
    } catch (err) {
      setError('Error during starred PBI analysis: ' + err.message)
      setIsProcessing(false)
      setIsLocalProcessing(false)
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
      setFiles(prev => prev.map(f => f.fileName === file.fileName ? { ...f, status: 'PROCESSING' } : f))
      if (rdlSource === 'DATABASE') {
        await api.analyzeFromDatabase(file.filePath)
      } else {
        await api.analyzeFile(file.fileName)
      }
      await loadFiles()
    } catch (err) {
      setError('Error analyzing file: ' + err.message)
      await loadFiles()
    }
  }

  const handleRunAll = async () => {
    try {
      setError(null)
      const filesToProcess = files.filter(file => {
        const matchesStatus = statusFilter === 'ALL' || file.status === statusFilter
        if (execFilters.hideNeverRan && file.neverRan === true) return false
        if (execFilters.hideStale && file.daysSinceLastRun !== null && file.daysSinceLastRun >= 30) return false
        if (execFilters.hideAlwaysError && file.successCount === 0 && file.errorCount > 0) return false
        if (execFilters.onlySubscription && (file.subscriptionCount === undefined || file.subscriptionCount === 0)) return false
        return matchesStatus
      })

      if (filesToProcess.length === 0) {
        setError('No files to process with current filters')
        return
      }

      setProcessingStatus({
        isRunning: true,
        totalFiles: filesToProcess.length,
        completedFiles: 0,
        errorFiles: 0,
        currentFile: 'Starting...',
        completed: false,
        progressPercent: 0,
      })
      setIsLocalProcessing(true)
      setIsProcessing(true)

      for (const file of filesToProcess) {
        setProcessingStatus(prev => ({ ...prev, currentFile: file.fileName }))
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
          setProcessingStatus(prev => ({ ...prev, errorFiles: prev.errorFiles + 1 }))
        }
      }

      setProcessingStatus(prev => ({ ...prev, completed: true, isRunning: false, currentFile: '' }))
      setIsProcessing(false)
      setIsLocalProcessing(false)
      await loadFiles()
    } catch (err) {
      setError('Error during batch analysis: ' + err.message)
      setIsProcessing(false)
      setIsLocalProcessing(false)
    }
  }

  const handleRunStarred = async () => {
    try {
      setError(null)
      const starredFiles = files.filter(file => file.starred === true)

      if (starredFiles.length === 0) {
        setError('No starred reports to process')
        return
      }

      setProcessingStatus({
        isRunning: true,
        totalFiles: starredFiles.length,
        completedFiles: 0,
        errorFiles: 0,
        currentFile: 'Starting...',
        completed: false,
        progressPercent: 0,
      })
      setIsLocalProcessing(true)
      setIsProcessing(true)

      for (const file of starredFiles) {
        setProcessingStatus(prev => ({ ...prev, currentFile: file.fileName }))
        try {
          if (rdlSource === 'DATABASE') {
            await api.analyzeFromDatabase(file.filePath)
          } else {
            await api.analyzeFile(file.fileName)
          }
          setProcessingStatus(prev => ({
            ...prev,
            completedFiles: prev.completedFiles + 1,
            progressPercent: ((prev.completedFiles + 1) / starredFiles.length) * 100
          }))
        } catch (err) {
          setProcessingStatus(prev => ({ ...prev, errorFiles: prev.errorFiles + 1 }))
        }
      }

      setProcessingStatus(prev => ({ ...prev, completed: true, isRunning: false, currentFile: '' }))
      setIsProcessing(false)
      setIsLocalProcessing(false)
      await loadFiles()
    } catch (err) {
      setError('Error during starred analysis: ' + err.message)
      setIsProcessing(false)
      setIsLocalProcessing(false)
    }
  }

  const handlePageChange = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  const handlePbiPageChange = (page) => {
    setPbiCurrentPage(Math.max(1, Math.min(page, pbiTotalPages)))
  }

  const handleViewLineage = (file) => {
    if (file.reportId) {
      navigate(`/lineage/${file.reportId}`)
    }
  }

  // Navigate to template lineage for a linked report
  const handleViewLinkedReportLineage = (linkedReport) => {
    // Find the template in the files list by matching the path
    const templateFile = files.find(f => {
      // Match by path (removing leading slash if needed)
      const templatePath = linkedReport.templatePath
      return f.filePath === templatePath ||
             f.filePath === templatePath.replace(/^\//, '') ||
             f.filePath.endsWith(templatePath) ||
             templatePath.endsWith(f.filePath)
    })

    if (templateFile && templateFile.reportId) {
      navigate(`/lineage/${templateFile.reportId}`, {
        state: { linkedReportName: linkedReport.linkedReportName }
      })
    } else {
      // Template not analyzed yet - show error
      const templateName = linkedReport.templatePath.split('/').pop()
      setError(`Template "${templateName}" not yet analyzed. Search for it in the list and run analysis first.`)
    }
  }

  const handleViewPbiLineage = (report) => {
    navigate(`/pbi/${report.id}`)
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

  const handleUnifiedExport = async (scope) => {
    try {
      setShowExportDropdown(false)
      const response = await api.exportUnifiedCsv(scope)
      const fileName = scope === 'ssrs' ? 'lineage_ssrs_reports.csv' :
                       scope === 'pbi' ? 'lineage_powerbi_reports.csv' :
                       'lineage_all_reports.csv'
      const url = window.URL.createObjectURL(response.data)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      setError('Error exporting CSV: ' + err.message)
    }
  }

  const handleExportStarredCsv = async () => {
    try {
      setShowExportDropdown(false)
      const response = await api.exportStarredCsv()
      const url = window.URL.createObjectURL(response.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'lineage_starred_reports.csv'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      setError('Error exporting starred CSV: ' + err.message)
    }
  }

  const handleExportStarredHtml = async () => {
    try {
      setShowExportDropdown(false)
      setExportingHtml(true)
      const response = await api.exportStarredHtml()
      const blob = new Blob([response.data], { type: 'text/html' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'lineage_starred_reports.html'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError('Error exporting starred HTML: ' + err.message)
    } finally {
      setExportingHtml(false)
    }
  }

  const handleExportStarredPbiCsv = async () => {
    try {
      setShowExportDropdown(false)
      const response = await api.exportStarredPbiCsv()
      const url = window.URL.createObjectURL(response.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'lineage_pbi_starred_reports.csv'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      setError('Error exporting starred PBI CSV: ' + err.message)
    }
  }

  const handleExportAllPbiCsv = async () => {
    try {
      setShowExportDropdown(false)
      const response = await api.exportAllPbiCsv()
      const url = window.URL.createObjectURL(response.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'lineage_pbi_all_reports.csv'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      setError('Error exporting PBI CSV: ' + err.message)
    }
  }

  const handleExportAllStarredCsv = async () => {
    try {
      setShowExportDropdown(false)
      const response = await api.exportAllStarredCsv()
      const url = window.URL.createObjectURL(response.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'lineage_all_starred_reports.csv'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      setError('Error exporting all starred CSV: ' + err.message)
    }
  }

  const handleExportPbiAllHtml = async () => {
    try {
      setShowExportDropdown(false)
      setExportingHtml(true)
      const response = await api.exportPbiAllHtml()
      const blob = new Blob([response.data], { type: 'text/html' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'lineage_pbi_all_reports.html'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError('Error exporting PBI HTML: ' + err.message)
    } finally {
      setExportingHtml(false)
    }
  }

  const handleExportPbiStarredHtml = async () => {
    try {
      setShowExportDropdown(false)
      setExportingHtml(true)
      const response = await api.exportPbiStarredHtml()
      const blob = new Blob([response.data], { type: 'text/html' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'lineage_pbi_starred_reports.html'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError('Error exporting PBI starred HTML: ' + err.message)
    } finally {
      setExportingHtml(false)
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showExportDropdown && !e.target.closest('.export-dropdown-container')) {
        setShowExportDropdown(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showExportDropdown])

  return (
    <div className="report-management">
      {/* Top bar with tabs and export */}
      <div className="top-bar">
        <div className="report-tabs">
          <button
            className={`tab-btn ${activeTab === 'SSRS' ? 'active' : ''}`}
            onClick={() => setActiveTab('SSRS')}
          >
            SSRS Reports
          </button>
          <button
            className={`tab-btn ${activeTab === 'PBI' ? 'active' : ''}`}
            onClick={() => setActiveTab('PBI')}
          >
            Power BI Reports
          </button>
        </div>

        <div className="export-dropdown-container">
          <button
            className="btn btn-secondary export-dropdown-btn"
            onClick={(e) => { e.stopPropagation(); setShowExportDropdown(!showExportDropdown); }}
          >
            Export CSV ▼
          </button>
          {showExportDropdown && (
            <div className="export-dropdown-menu">
              <div className="export-section-label">SSRS Reports</div>
              <button onClick={() => handleUnifiedExport('ssrs')}>
                All SSRS ({statusCounts.COMPLETED || 0})
              </button>
              <button onClick={handleExportStarredCsv} disabled={starredCount + linkedStarredCount === 0}>
                Starred SSRS ({starredCount} templates, {linkedStarredCount} linked)
              </button>
              <button onClick={handleExportStarredHtml} disabled={exportingHtml || starredCount + linkedStarredCount === 0}>
                {exportingHtml ? 'Exporting...' : 'Starred SSRS HTML'}
              </button>
              <hr />
              <div className="export-section-label">Power BI Reports</div>
              <button onClick={handleExportAllPbiCsv} disabled={pbiStatus.reportCount === 0}>
                All Power BI CSV ({pbiStatus.reportCount})
              </button>
              <button onClick={handleExportStarredPbiCsv} disabled={pbiStarredCount === 0}>
                Starred Power BI CSV ({pbiStarredCount})
              </button>
              <button onClick={handleExportPbiAllHtml} disabled={exportingHtml || pbiStatus.reportCount === 0}>
                {exportingHtml ? 'Exporting...' : `All Power BI HTML (${pbiStatus.reportCount})`}
              </button>
              <button onClick={handleExportPbiStarredHtml} disabled={exportingHtml || pbiStarredCount === 0}>
                {exportingHtml ? 'Exporting...' : `Starred Power BI HTML (${pbiStarredCount})`}
              </button>
              <hr />
              <div className="export-section-label">Combined</div>
              <button onClick={() => handleUnifiedExport('both')}>
                All Reports (SSRS + PBI)
              </button>
              <button onClick={handleExportAllStarredCsv} disabled={starredCount + linkedStarredCount + pbiStarredCount === 0}>
                All Starred ({starredCount + linkedStarredCount} SSRS, {pbiStarredCount} PBI)
              </button>
              <button onClick={handleExportAllHtml} disabled={exportingHtml || (statusCounts.COMPLETED || 0) === 0}>
                {exportingHtml ? 'Exporting...' : 'All SSRS HTML'}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* SSRS Tab Content */}
      {activeTab === 'SSRS' && (
        <>
          <section className="metadata-section">
            <h2>Metadata</h2>
            <div className="metadata-controls">
              <button onClick={handleLoadMetadata} disabled={loading} className="btn btn-primary">
                Load Metadata
              </button>

              {metadataStatus && metadataStatus.loaded && (
                <a
                  href="http://localhost:8080/api/metadata/syspro-views-export"
                  download="syspro_view_dependencies.csv"
                  className="btn btn-secondary"
                  style={{ marginLeft: '10px' }}
                >
                  📥 Export SysproReporting Views
                </a>
              )}

              {metadataStatus && metadataStatus.loaded && (
                <div className="metadata-status">
                  <span className="status-badge success">Metadata loaded</span>
                  <button className="metadata-toggle" onClick={() => setMetadataExpanded(!metadataExpanded)}>
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
                <p className="csv-intro">CSV files loaded. See SQL/ folder for queries:</p>
                <table className="csv-details-table">
                  <thead>
                    <tr>
                      <th>CSV File</th>
                      <th>Purpose</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>sysproreporting_stored_procs.csv</td><td>Stored procedure definitions</td><td>{metadataStatus.procCount}</td></tr>
                    <tr><td>all_views.csv</td><td>View definitions</td><td>{metadataStatus.viewCount}</td></tr>
                    <tr><td>tables_with_pks.csv</td><td>Tables with PK info</td><td>{metadataStatus.tableCount}</td></tr>
                    <tr><td>shared_datasets.csv</td><td>SSRS shared datasets</td><td>{metadataStatus.sharedDatasetCount}</td></tr>
                    <tr><td>shared_datasources.csv</td><td>SSRS shared data sources</td><td>{metadataStatus.sharedDataSourceCount}</td></tr>
                    <tr><td>linked_servers.csv</td><td>SQL Server linked servers</td><td>{metadataStatus.linkedServerCount}</td></tr>
                    <tr><td>dependencies.csv</td><td>SQL Server dependencies</td><td>{metadataStatus.dependencyCount}</td></tr>
                    <tr><td>rdl_reports.txt</td><td>RDL report definitions</td><td>-</td></tr>
                    <tr><td>linked_reports.csv</td><td>Linked Reports (Type 4)</td><td>-</td></tr>
                    <tr><td>report_execution_history.csv</td><td>Execution stats</td><td>-</td></tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rdl-section">
            <div className="section-header">
              <h2>SSRS Reports ({files.length} total)</h2>
              <div className="section-controls">
                {/* Source selector - only show if file-based RDL is enabled */}
                {appConfig.features?.enableFileBasedRdl && (
                  <div className="source-selector">
                    <label>Source:</label>
                    <select
                      value={rdlSource}
                      onChange={(e) => setRdlSource(e.target.value)}
                      disabled={loading}
                    >
                      <option value="FILES" disabled={!sourceStatus.filesAvailable}>
                        Files {!sourceStatus.filesAvailable && '(unavailable)'}
                      </option>
                      <option value="DATABASE" disabled={!sourceStatus.databaseAvailable}>
                        Database {sourceStatus.databaseCount > 0 && `(${sourceStatus.databaseCount})`}
                      </option>
                    </select>
                    {rdlSource === 'DATABASE' && (
                      <button onClick={handleLoadRdlDatabase} disabled={loading} className="btn btn-sm">
                        Reload RDL Reports
                      </button>
                    )}
                    <button className="btn btn-sm btn-help" onClick={() => setShowExportHelp(!showExportHelp)} title="How to export RDL reports">
                      ?
                    </button>
                  </div>
                )}
                {/* When file-based RDL is disabled, just show Reload RDL Reports button */}
                {!appConfig.features?.enableFileBasedRdl && (
                  <div className="source-selector">
                    <button onClick={handleLoadRdlDatabase} disabled={loading} className="btn btn-sm">
                      Reload RDL Reports
                    </button>
                  </div>
                )}

                <button onClick={handleScan} disabled={loading} className="btn">Scan</button>
                <button
                  onClick={handleRunStarred}
                  disabled={loading || isProcessing || starredCount === 0}
                  className="btn btn-warning"
                >
                  Run Starred ({starredCount})
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
              </div>
            </div>

            {showExportHelp && (
              <div className="export-help-box">
                <h4>How to Export RDL Reports from SQL Server</h4>
                <p className="help-warning">
                  <strong>Important:</strong> Export as <strong>TAB-delimited</strong> (.txt), NOT CSV!
                </p>
                <button className="btn btn-sm" onClick={() => setShowExportHelp(false)}>Close</button>
              </div>
            )}

            {isProcessing && processingStatus && (
              <ProcessingProgress status={processingStatus} />
            )}

            {/* Filters */}
            <div className="filters-bar">
              <div className="filters-row">
                <div className="search-box">
                  <input
                    type="text"
                    placeholder="Search reports..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                  />
                  {searchTerm && (
                    <button className="clear-search" onClick={() => setSearchTerm('')}>&times;</button>
                  )}
                </div>

                <div className="status-filters">
                  <span className="filter-group-label">Status:</span>
                  {['ALL', 'PENDING', 'COMPLETED', 'ERROR'].map(status => (
                    <button
                      key={status}
                      className={`filter-btn ${status.toLowerCase()} ${statusFilter === status ? 'active' : ''}`}
                      onClick={() => setStatusFilter(status)}
                    >
                      {status === 'ALL' ? `All (${files.length})` : `${status} (${statusCounts[status] || 0})`}
                    </button>
                  ))}
                </div>

                <div className="page-size-selector">
                  <label>Show:</label>
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                    {PAGE_SIZE_OPTIONS.map(size => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </div>
              </div>

              {execCounts.hasExecData > 0 && (
                <div className="filters-row exec-filters-row">
                  <span className="filter-group-label">Execution:</span>
                  {[
                    { key: 'hideNeverRan', label: `Hide never ran (${execCounts.neverRan})` },
                    { key: 'hideStale', label: `Hide stale 30+ days (${execCounts.stale})` },
                    { key: 'hideAlwaysError', label: `Hide always-error (${execCounts.alwaysError})` },
                    { key: 'onlySubscription', label: `Only subscription (${execCounts.subscription})` },
                  ].map(({ key, label }) => (
                    <label key={key} className="exec-filter-checkbox">
                      <input
                        type="checkbox"
                        checked={execFilters[key]}
                        onChange={() => handleExecFilterChange(key)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {searchTerm.length >= 2 && linkedReportLoading && (
              <div className="linked-reports-loading">Searching reports...</div>
            )}

            {/* Results info */}
            <div className="results-info">
              {searchTerm.length >= 2
                ? (combinedResults.length > 0
                    ? `Found ${combinedResults.length} reports matching "${searchTerm}" (${linkedReportMatches.length} linked, ${filteredFiles.length} templates) - Showing ${paginatedResults.length}`
                    : `No reports found matching "${searchTerm}"`)
                : `Showing ${paginatedResults.length} of ${totalResults} reports (${allLinkedReports.length} linked, ${filteredFiles.length} templates)${statusFilter !== 'ALL' ? ` with status ${statusFilter}` : ''}`
              }
            </div>

            {/* Unified table - same structure for search and browse */}
            <div className="file-list">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Report Name</th>
                    <th>Report Path</th>
                    <th>Template Path</th>
                    <th>Status</th>
                    <th>Executions</th>
                    <th>Last Executed</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedResults.map(item => (
                    item.type === 'linked' ? (
                      <tr key={item.id}>
                        <td><span className="type-badge linked">Linked</span></td>
                        <td className="file-name" title={item.name}>
                          <button
                            className={`star-btn ${item.linkedReport.starred ? 'starred' : ''}`}
                            onClick={(e) => { e.stopPropagation(); handleToggleLinkedStar(item.linkedReport); }}
                            title={item.linkedReport.starred ? 'Unstar report' : 'Star report'}
                          >
                            {item.linkedReport.starred ? '★' : '☆'}
                          </button>
                          {item.name}
                        </td>
                        <td className="file-path" title={item.path}>{item.path}</td>
                        <td className="file-path" title={item.templatePath}>{item.templatePath}</td>
                        <td>-</td>
                        <td>-</td>
                        <td>-</td>
                        <td className="actions-cell">
                          <button
                            className="btn btn-sm btn-view"
                            onClick={() => handleViewLinkedReportLineage(item.linkedReport)}
                          >
                            View Lineage
                          </button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={item.id} className={item.file.neverRan ? 'never-ran-row' : ''}>
                        <td><span className="type-badge template">Template</span></td>
                        <td className="file-name" title={item.name}>
                          {item.file.status === 'COMPLETED' && (
                            <button
                              className={`star-btn ${item.file.starred ? 'starred' : ''}`}
                              onClick={(e) => { e.stopPropagation(); handleToggleStar(item.file); }}
                              title={item.file.starred ? 'Unstar report' : 'Star report'}
                            >
                              {item.file.starred ? '★' : '☆'}
                            </button>
                          )}
                          {item.name}
                          {item.file.neverRan && <span className="exec-badge never-ran">Never Ran</span>}
                          {item.file.daysSinceLastRun !== null && item.file.daysSinceLastRun >= 30 && !item.file.neverRan && (
                            <span className="exec-badge stale">Stale</span>
                          )}
                          {item.file.subscriptionCount > 0 && (
                            <span className="exec-badge subscription" title={`${item.file.subscriptionCount} subscription runs`}>Sub</span>
                          )}
                        </td>
                        <td className="file-path" title={item.path}>{item.path}</td>
                        <td className="file-path">-</td>
                        <td><span className={`status-badge ${item.file.status?.toLowerCase()}`}>{item.file.status}</span></td>
                        <td className="exec-count">{item.file.executionCount !== undefined ? item.file.executionCount : '-'}</td>
                        <td className="last-executed">{item.file.lastExecutedAt || (item.file.neverRan ? 'Never' : '-')}</td>
                        <td className="actions-cell">
                          <button
                            onClick={() => handleRunSingle(item.file)}
                            disabled={isProcessing || item.file.status === 'PROCESSING'}
                            className="btn btn-sm"
                          >
                            {item.file.status === 'PROCESSING' ? '...' : 'Run'}
                          </button>
                          {item.file.status === 'COMPLETED' && (
                            <button
                              className="btn btn-sm btn-view"
                              onClick={() => handleViewLineage(item.file)}
                            >
                              View Lineage
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination - works for both search and browse */}
            {totalPages > 1 && (
              <div className="pagination">
                <button className="page-btn" disabled={currentPage === 1} onClick={() => handlePageChange(1)}>First</button>
                <button className="page-btn" disabled={currentPage === 1} onClick={() => handlePageChange(currentPage - 1)}>Prev</button>
                <div className="page-numbers">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum
                    if (totalPages <= 5) pageNum = i + 1
                    else if (currentPage <= 3) pageNum = i + 1
                    else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i
                    else pageNum = currentPage - 2 + i
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
                <button className="page-btn" disabled={currentPage === totalPages} onClick={() => handlePageChange(currentPage + 1)}>Next</button>
                <button className="page-btn" disabled={currentPage === totalPages} onClick={() => handlePageChange(totalPages)}>Last</button>
                <span className="page-info">Page {currentPage} of {totalPages}</span>
              </div>
            )}
          </section>
        </>
      )}

      {/* PBI Tab Content */}
      {activeTab === 'PBI' && (
        <section className="pbi-section">
          <div className="section-header">
            <h2>Power BI Reports ({pbiReports.length} total)</h2>
            <div className="section-controls">
              <button
                onClick={handleLoadPbiData}
                disabled={pbiLoading}
                className="btn btn-primary"
              >
                {pbiLoading ? 'Loading...' : 'Load Excel'}
              </button>
              <button
                onClick={handleRunStarredPbi}
                disabled={pbiLoading || isProcessing || pbiStarredCount === 0}
                className="btn btn-warning"
              >
                Run Starred ({pbiStarredCount})
              </button>
              {pbiStatus.loaded && (
                <span className="pbi-status">
                  {pbiStatus.reportCount} reports, {pbiStatus.tableCount} table mappings
                </span>
              )}
            </div>
          </div>

          {isProcessing && processingStatus && activeTab === 'PBI' && (
            <ProcessingProgress status={processingStatus} />
          )}

          {!pbiStatus.loaded && (
            <div className="pbi-empty-state">
              <p>No Power BI data loaded.</p>
              <p>Click "Load Excel" to import data from <code>data/FP Reporting_DataSourcesMapping.xlsx</code></p>
            </div>
          )}

          {pbiStatus.loaded && (
            <>
              <div className="filters-bar">
                <div className="filters-row">
                  <div className="search-box">
                    <input
                      type="text"
                      placeholder="Search by report name..."
                      value={pbiSearchTerm}
                      onChange={(e) => { setPbiSearchTerm(e.target.value); setPbiCurrentPage(1); }}
                      className="search-input"
                    />
                    {pbiSearchTerm && (
                      <button className="clear-search" onClick={() => setPbiSearchTerm('')}>&times;</button>
                    )}
                  </div>
                  <div className="page-size-selector">
                    <label>Show:</label>
                    <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                      {PAGE_SIZE_OPTIONS.map(size => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="results-info">
                Showing {paginatedPbiReports.length} of {filteredPbiReports.length} reports
                {pbiSearchTerm && ` matching "${pbiSearchTerm}"`}
              </div>

              <table className="pbi-reports-table">
                <thead>
                  <tr>
                    <th>Report Name</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pbiLoading && (
                    <tr><td colSpan="2" className="loading">Loading...</td></tr>
                  )}
                  {!pbiLoading && paginatedPbiReports.length === 0 && (
                    <tr><td colSpan="2" className="empty-state">No reports found</td></tr>
                  )}
                  {paginatedPbiReports.map(report => (
                    <tr key={report.id}>
                      <td className="file-name">
                        <button
                          className={`star-btn ${report.starred ? 'starred' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleTogglePbiStar(report); }}
                          title={report.starred ? 'Unstar report' : 'Star report'}
                        >
                          {report.starred ? '★' : '☆'}
                        </button>
                        {report.reportName}
                      </td>
                      <td className="actions-cell">
                        <button
                          className="btn btn-sm btn-view"
                          onClick={() => handleViewPbiLineage(report)}
                        >
                          View Lineage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {pbiTotalPages > 1 && (
                <div className="pagination">
                  <button className="page-btn" disabled={pbiCurrentPage === 1} onClick={() => handlePbiPageChange(1)}>First</button>
                  <button className="page-btn" disabled={pbiCurrentPage === 1} onClick={() => handlePbiPageChange(pbiCurrentPage - 1)}>Prev</button>
                  <div className="page-numbers">
                    {Array.from({ length: Math.min(5, pbiTotalPages) }, (_, i) => {
                      let pageNum
                      if (pbiTotalPages <= 5) pageNum = i + 1
                      else if (pbiCurrentPage <= 3) pageNum = i + 1
                      else if (pbiCurrentPage >= pbiTotalPages - 2) pageNum = pbiTotalPages - 4 + i
                      else pageNum = pbiCurrentPage - 2 + i
                      return (
                        <button
                          key={pageNum}
                          className={`page-btn ${pbiCurrentPage === pageNum ? 'active' : ''}`}
                          onClick={() => handlePbiPageChange(pageNum)}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>
                  <button className="page-btn" disabled={pbiCurrentPage === pbiTotalPages} onClick={() => handlePbiPageChange(pbiCurrentPage + 1)}>Next</button>
                  <button className="page-btn" disabled={pbiCurrentPage === pbiTotalPages} onClick={() => handlePbiPageChange(pbiTotalPages)}>Last</button>
                  <span className="page-info">Page {pbiCurrentPage} of {pbiTotalPages}</span>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}

export default ReportManagement
