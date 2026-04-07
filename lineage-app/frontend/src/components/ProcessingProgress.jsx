import React from 'react'

function formatTime(seconds) {
  if (seconds <= 0) return '--:--'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function ProcessingProgress({ status }) {
  const {
    totalFiles,
    completedFiles,
    errorFiles,
    currentFile,
    progressPercent,
    elapsedSeconds = 0,
    estimatedSecondsRemaining = 0,
    averageSecondsPerFile = 0
  } = status

  const processed = completedFiles + errorFiles
  const remaining = totalFiles - processed

  return (
    <div className="processing-progress">
      <div className="progress-header">
        <span className="progress-title">
          Processing: {processed}/{totalFiles} files
        </span>
        <span className="progress-remaining">
          {remaining} remaining
        </span>
      </div>

      {currentFile && (
        <div className="current-file-row">
          <span className="current-label">Current:</span>
          <span className="current-file">{currentFile}</span>
        </div>
      )}

      <div className="progress-bar-container">
        <div
          className="progress-bar"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="progress-stats">
        <span className="stat success">{completedFiles} completed</span>
        {errorFiles > 0 && (
          <span className="stat error">{errorFiles} errors</span>
        )}
        <span className="stat percent">{Math.round(progressPercent)}%</span>
      </div>

      <div className="progress-time">
        <span className="time-stat">
          <span className="time-label">Elapsed:</span>
          <span className="time-value">{formatTime(elapsedSeconds)}</span>
        </span>
        <span className="time-stat">
          <span className="time-label">Remaining:</span>
          <span className="time-value">{formatTime(estimatedSecondsRemaining)}</span>
        </span>
        {averageSecondsPerFile > 0 && (
          <span className="time-stat">
            <span className="time-label">Avg/file:</span>
            <span className="time-value">{averageSecondsPerFile}s</span>
          </span>
        )}
      </div>
    </div>
  )
}

export default ProcessingProgress
