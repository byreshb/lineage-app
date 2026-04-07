import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/lineageApi'
import ForceLineageGraph from '../components/ForceLineageGraph'
import LineageLegend from '../components/LineageLegend'
import TableList from '../components/TableList'
import NodeDetails from '../components/NodeDetails'

function LineageViewer() {
  const { reportId } = useParams()
  const navigate = useNavigate()

  const [selectedReport, setSelectedReport] = useState(null)
  const [lineageData, setLineageData] = useState(null)
  const [tables, setTables] = useState([])
  const [dataSources, setDataSources] = useState([])
  const [executions, setExecutions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)

  // Load lineage when reportId changes
  useEffect(() => {
    if (reportId) {
      loadLineage(reportId)
    }
  }, [reportId])

  // Download helper function
  const downloadFile = (blob, filename) => {
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const handleExportSingle = async () => {
    try {
      const response = await api.exportLineageCsv(reportId)
      const filename = selectedReport
        ? `lineage_${selectedReport.reportName.replace(/[^a-zA-Z0-9]/g, '_')}.csv`
        : `lineage_report_${reportId}.csv`
      downloadFile(response.data, filename)
    } catch (err) {
      setError('Error exporting CSV: ' + err.message)
    }
  }

  const handleExportHtml = async () => {
    try {
      const response = await api.exportLineageHtml(reportId)
      const filename = selectedReport
        ? `lineage_${selectedReport.reportName.replace(/[^a-zA-Z0-9]/g, '_')}.html`
        : `lineage_report_${reportId}.html`
      downloadFile(response.data, filename)
    } catch (err) {
      setError('Error exporting HTML: ' + err.message)
    }
  }

  const loadLineage = async (id) => {
    try {
      setLoading(true)
      setError(null)

      const [reportRes, lineageRes, tablesRes, dataSourcesRes, executionsRes] = await Promise.all([
        api.getReport(id),
        api.getLineage(id),
        api.getSourceTables(id),
        api.getDataSources(id),
        api.getReportExecutions(id, 20).catch(() => ({ data: [] })) // Don't fail if no executions
      ])

      setSelectedReport(reportRes.data)
      setLineageData(lineageRes.data)
      setTables(tablesRes.data)
      setDataSources(dataSourcesRes.data)
      setExecutions(executionsRes.data || [])
    } catch (err) {
      setError('Error loading lineage: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    navigate('/', { state: { activeTab: 'SSRS' } })
  }

  // Parse URL-encoded parameters string into structured key-value pairs
  const parseParameters = (paramString) => {
    if (!paramString) return []
    try {
      return paramString.split('&').map(pair => {
        const [key, ...valueParts] = pair.split('=')
        const value = valueParts.join('=') // Handle values with = in them
        return {
          name: decodeURIComponent(key || ''),
          value: decodeURIComponent(value || '').replace(/\+/g, ' ')
        }
      }).filter(p => p.name) // Filter out empty entries
    } catch (e) {
      return [{ name: 'Raw', value: paramString }]
    }
  }

  // Redirect to home if no report selected
  if (!reportId) {
    navigate('/')
    return null
  }

  return (
    <div className="lineage-viewer">
      <div className="viewer-header">
        <button onClick={handleBack} className="btn btn-back">
          &larr; Back
        </button>

        {selectedReport && (
          <div className="report-info">
            <h2>{selectedReport.reportName}</h2>
            <span className="last-analyzed">
              Last analyzed: {selectedReport.lastRunAt}
            </span>
            <button onClick={handleExportSingle} className="btn btn-sm export-btn">
              Export CSV
            </button>
            <button onClick={handleExportHtml} className="btn btn-sm export-btn">
              Export HTML
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="error-message">{error}</div>
      )}

      {loading ? (
        <div className="loading">Loading lineage data...</div>
      ) : lineageData && (
        <>
          {/* Source Tables - at the top */}
          <div className="tables-section">
            <h3>Source Tables</h3>
            <div className="status-legend">
              <span className="legend-title">In SysproReporting:</span>
              <span className="legend-item">
                <span className="status-badge status-ok">Yes</span>
                Table exists in SysproReporting
              </span>
              <span className="legend-item">
                <span className="status-badge status-not-found">No</span>
                Table not found in SysproReporting
              </span>
            </div>
            <TableList tables={tables} />
          </div>

          {/* Data Sources */}
          {dataSources && dataSources.length > 0 && (
            <div className="datasources-section">
              <h3>Data Sources</h3>
              <table className="datasources-table">
                <thead>
                  <tr>
                    <th>XML Name</th>
                    <th>XML Type</th>
                    <th>XML Reference Path</th>
                    <th>Metadata Database</th>
                  </tr>
                </thead>
                <tbody>
                  {dataSources.map((ds, idx) => (
                    <tr key={idx}>
                      <td>{ds.sourceName}</td>
                      <td>
                        <span className={`source-badge ${ds.sourceType?.toLowerCase()}`}>
                          {ds.sourceType}
                        </span>
                      </td>
                      <td className="reference-path">{ds.referencePath || '-'}</td>
                      <td>{ds.metadataDatabase || ds.xmlDatabase || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent Executions with Parameters */}
          {executions && executions.length > 0 && (
            <div className="executions-section">
              <h3>Recent Executions (with Parameters)</h3>
              <table className="executions-table">
                <thead>
                  <tr>
                    <th>Executed At</th>
                    <th>Status</th>
                    <th>Type</th>
                    <th>User</th>
                    <th>Parameters</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map((exec, idx) => (
                    <tr key={idx}>
                      <td className="execution-time">{exec.executedAt}</td>
                      <td>
                        <span className={`status-badge ${exec.status === 'rsSuccess' ? 'status-ok' : 'status-error'}`}>
                          {exec.status === 'rsSuccess' ? 'Success' : exec.status}
                        </span>
                      </td>
                      <td>
                        <span className={`request-type ${exec.requestType?.toLowerCase()}`}>
                          {exec.requestType}
                        </span>
                      </td>
                      <td className="user-name">{exec.userName || '-'}</td>
                      <td className="parameters-cell">
                        {exec.parameters ? (
                          <div className="parameters-list">
                            {parseParameters(exec.parameters).map((param, pIdx) => (
                              <div key={pIdx} className="param-item">
                                <span className="param-name">{param.name}</span>
                                <span className="param-value">{param.value}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="no-params">No parameters</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Parsing Warnings */}
          {lineageData.warnings && lineageData.warnings.length > 0 && (
            <div className="warnings-section">
              <h3>Parsing Warnings</h3>
              <p className="warnings-intro">
                The following entities contain dynamic SQL that may have table references we couldn't extract:
              </p>
              <ul className="warnings-list">
                {lineageData.warnings.map((w, idx) => (
                  <li key={idx}>
                    <span className={`type-badge ${w.entityType?.toLowerCase()}`}>{w.entityType}</span>
                    <strong>{w.entityName}</strong>: {w.warning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Lineage Diagram - at the bottom */}
          <p className="click-hint">Click on any PROC, VIEW, or SHARED_DATASET node to see its SQL definition. Drag nodes to rearrange. Scroll to zoom.</p>

          <LineageLegend />

          <div className="graph-container">
            <ForceLineageGraph data={lineageData} onNodeClick={setSelectedNode} />
          </div>

          {selectedNode && (
            <NodeDetails node={selectedNode} onClose={() => setSelectedNode(null)} />
          )}
        </>
      )}
    </div>
  )
}

export default LineageViewer
