import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/lineageApi'
import ForceLineageGraph from '../components/ForceLineageGraph'
import LineageLegend from '../components/LineageLegend'
import NodeDetails from '../components/NodeDetails'

function PbiViewer() {
  const { reportId } = useParams()
  const navigate = useNavigate()

  const [report, setReport] = useState(null)
  const [lineageData, setLineageData] = useState(null)
  const [tables, setTables] = useState([])
  const [externalSources, setExternalSources] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)

  // Load data when reportId changes
  useEffect(() => {
    if (reportId) {
      loadData(reportId)
    }
  }, [reportId])

  const loadData = async (id) => {
    try {
      setLoading(true)
      setError(null)

      const [reportRes, lineageRes, tablesRes, externalRes] = await Promise.all([
        api.getPbiReport(id),
        api.getPbiLineage(id),
        api.getPbiTables(id),
        api.getPbiExternalSources(id)
      ])

      setReport(reportRes.data)
      setLineageData(lineageRes.data)
      setTables(tablesRes.data)
      setExternalSources(externalRes.data)
    } catch (err) {
      setError('Error loading PBI lineage: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    navigate('/', { state: { activeTab: 'PBI' } })
  }

  const handleExportCsv = async () => {
    try {
      const response = await api.exportPbiCsv(reportId)
      const filename = report
        ? `lineage_pbi_${report.reportName.replace(/[^a-zA-Z0-9]/g, '_')}.csv`
        : `lineage_pbi_${reportId}.csv`
      const url = window.URL.createObjectURL(response.data)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      setError('Error exporting CSV: ' + err.message)
    }
  }

  const handleRebuildLineage = async () => {
    try {
      setLoading(true)
      await api.buildPbiLineage(reportId)
      await loadData(reportId)
    } catch (err) {
      setError('Error rebuilding lineage: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!reportId) {
    navigate('/')
    return null
  }

  return (
    <div className="lineage-viewer pbi-viewer">
      <div className="viewer-header">
        <button onClick={handleBack} className="btn btn-back">
          &larr; Back
        </button>

        {report && (
          <div className="report-info">
            <h2>
              <span className="pbi-badge">Power BI</span>
              {report.reportName}
            </h2>
            <span className="table-count">{report.tableCount} table mappings</span>
            <button onClick={handleExportCsv} className="btn btn-sm export-btn">
              Export CSV
            </button>
            <button onClick={handleRebuildLineage} className="btn btn-sm" disabled={loading}>
              Rebuild Lineage
            </button>
          </div>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading Power BI lineage data...</div>
      ) : lineageData && (
        <>
          {/* Source Tables/Views */}
          <div className="tables-section">
            <h3>Source Entities</h3>
            <div className="status-legend">
              <span className="legend-title">In SQL2(D300SQLDW01):</span>
              <span className="legend-item">
                <span className="status-badge status-ok">Yes</span>
                Table exists in SQL2(D300SQLDW01)
              </span>
              <span className="legend-item">
                <span className="status-badge status-not-found">No</span>
                Table not found in SQL2(D300SQLDW01)
              </span>
            </div>
            <table className="pbi-tables-table">
              <thead>
                <tr>
                  <th>PBI Table</th>
                  <th colSpan="2" className="header-group excel-header">From Excel</th>
                  <th colSpan="3" className="header-group db-header">Found in Database</th>
                  <th>Type</th>
                  <th>In SQL2(D300SQLDW01)</th>
                  <th>External Sources</th>
                </tr>
                <tr className="subheader-row">
                  <th></th>
                  <th className="subheader excel-col">Database</th>
                  <th className="subheader excel-col">Reference</th>
                  <th className="subheader db-col">Database</th>
                  <th className="subheader db-col">Schema</th>
                  <th className="subheader db-col">Name</th>
                  <th></th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tables.length === 0 && (
                  <tr><td colSpan="9" className="empty-state">No table mappings found</td></tr>
                )}
                {tables.map((table, idx) => (
                  <tr key={idx} className={
                    table.status === 'No' || table.status === 'NOT_FOUND' ? 'not-found-row' :
                    table.status === 'EXTERNAL' ? 'external-row' :
                    table.status === 'PARTIAL' ? 'partial-row' : ''
                  }>
                    <td className="file-name">{table.pbiTableName}</td>
                    <td className="excel-col">{table.excelDatabase || '-'}</td>
                    <td className="excel-col code">{table.excelReference}</td>
                    <td className="db-col">{table.resolvedDatabase || '-'}</td>
                    <td className="db-col">{table.resolvedSchema || '-'}</td>
                    <td className="db-col code">{table.resolvedName}</td>
                    <td>
                      <span className={`source-type ${table.entityType?.toLowerCase()}`}>
                        {table.entityType}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge status-${table.status?.toLowerCase()}`}>
                        {table.status}
                      </span>
                    </td>
                    <td>
                      {table.externalSources && table.externalSources.length > 0 ? (
                        <span className="external-sources-list">
                          {table.externalSources.slice(0, 3).join(', ')}
                          {table.externalSources.length > 3 && ` +${table.externalSources.length - 3} more`}
                        </span>
                      ) : table.nestedViews && table.nestedViews.length > 0 ? (
                        <span className="nested-views-list">
                          {table.nestedViews.join(' → ')}
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* External Sources Summary */}
          {externalSources.length > 0 && (
            <div className="external-sources-section">
              <h3>External Sources (Not in Metadata)</h3>
              <p className="external-sources-intro">
                These tables/views are referenced by the report but exist in <strong>external databases</strong> that are not included in the loaded metadata.
                To trace lineage through these sources, export tables from these databases and reload metadata.
              </p>
              <table className="external-sources-table">
                <thead>
                  <tr>
                    <th>Database</th>
                    <th>Schema</th>
                    <th>Table/View</th>
                    <th>Used By (PBI Tables)</th>
                  </tr>
                </thead>
                <tbody>
                  {externalSources.map((ext, idx) => (
                    <tr key={idx}>
                      <td className="db-name">{ext.database}</td>
                      <td className="schema-name">{ext.schema || '-'}</td>
                      <td className="source-name code">{ext.table}</td>
                      <td className="used-by">{ext.usedBy.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="external-sources-summary">
                <strong>Summary:</strong> {externalSources.length} external source(s) from {
                  [...new Set(externalSources.map(e => e.database))].length
                } database(s): {
                  [...new Set(externalSources.map(e => e.database))].join(', ')
                }
              </div>
            </div>
          )}

          {/* Lineage Diagram */}
          <p className="click-hint">
            Click on VIEW nodes to see their SQL definition. Drag nodes to rearrange. Scroll to zoom.
          </p>

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

export default PbiViewer
