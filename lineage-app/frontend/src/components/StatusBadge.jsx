import React from 'react'

function StatusBadge({ status }) {
  const getStatusClass = () => {
    switch (status) {
      case 'COMPLETED':
        return 'success'
      case 'PROCESSING':
        return 'processing'
      case 'ERROR':
        return 'error'
      case 'PENDING':
      default:
        return 'pending'
    }
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'COMPLETED':
        return '\u2713' // checkmark
      case 'PROCESSING':
        return '\uD83D\uDD04' // rotating arrows
      case 'ERROR':
        return '\u2717' // X
      case 'PENDING':
      default:
        return '\u23F3' // hourglass
    }
  }

  return (
    <span className={`status-badge ${getStatusClass()}`}>
      <span className="status-icon">{getStatusIcon()}</span>
      {status}
    </span>
  )
}

export default StatusBadge
