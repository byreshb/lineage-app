import React from 'react'
import StatusBadge from './StatusBadge'

function RdlFileList({ files, loading, onRunSingle, onViewLineage, isProcessing }) {
  if (loading) {
    return <div className="loading">Loading files...</div>
  }

  if (files.length === 0) {
    return (
      <div className="empty-state">
        <p>No RDL files found.</p>
        <p>Place .rdl files in the configured folder and click "Scan".</p>
      </div>
    )
  }

  // Check if any files have execution data
  const hasExecData = files.some(f => f.executionCount !== undefined)

  return (
    <div className="file-list">
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Report Name</th>
            <th>Report Path</th>
            <th>Template Path</th>
            <th>Status</th>
            {hasExecData && <th>Executions</th>}
            {hasExecData && <th>Last Executed</th>}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {files.map(file => (
            <tr key={file.fileName} className={file.neverRan ? 'never-ran-row' : ''}>
              <td><span className="type-badge template">Template</span></td>
              <td className="file-name" title={file.fileName.replace('.rdl', '')}>
                {file.fileName.replace('.rdl', '')}
                {file.neverRan && <span className="exec-badge never-ran">Never Ran</span>}
                {file.daysSinceLastRun !== null && file.daysSinceLastRun >= 30 && !file.neverRan && (
                  <span className="exec-badge stale">Stale</span>
                )}
                {file.subscriptionCount > 0 && (
                  <span className="exec-badge subscription" title={`${file.subscriptionCount} subscription runs`}>Sub</span>
                )}
              </td>
              <td className="file-path" title={file.filePath || '-'}>{file.filePath || '-'}</td>
              <td className="file-path">-</td>
              <td>
                <StatusBadge status={file.status} />
              </td>
              {hasExecData && (
                <td className="exec-count" title={file.executionCount !== undefined ? `${file.successCount} success, ${file.errorCount} errors` : ''}>
                  {file.executionCount !== undefined ? file.executionCount : '-'}
                </td>
              )}
              {hasExecData && (
                <td className="last-executed">
                  {file.lastExecutedAt || (file.neverRan ? 'Never' : '-')}
                </td>
              )}
              <td className="actions-cell">
                <button
                  onClick={() => onRunSingle(file)}
                  disabled={isProcessing || file.status === 'PROCESSING'}
                  className="btn btn-sm"
                >
                  {file.status === 'PROCESSING' ? '...' : 'Run'}
                </button>
                {file.status === 'COMPLETED' && onViewLineage && (
                  <button
                    onClick={() => onViewLineage(file)}
                    className="btn btn-sm btn-view"
                    title="View lineage graph"
                  >
                    View Lineage
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {files.some(f => f.errorMessage) && (
        <div className="error-details">
          <h4>Errors:</h4>
          {files.filter(f => f.errorMessage).map(f => (
            <div key={f.fileName} className="error-item">
              <strong>{f.fileName}:</strong> {f.errorMessage}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default RdlFileList
