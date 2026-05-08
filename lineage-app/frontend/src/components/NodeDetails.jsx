import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { format } from 'sql-formatter'
import { getStoredProcedure, getView, getSharedDataset } from '../api/lineageApi'

// Simple fallback formatter using regex when sql-formatter fails
function simpleFormatSql(sql) {
  if (!sql) return sql

  let formatted = sql

  // Preserve block comments by temporarily replacing them
  const blockComments = []
  formatted = formatted.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    blockComments.push(match)
    return `__BLOCK_COMMENT_${blockComments.length - 1}__`
  })

  // Preserve string literals by temporarily replacing them
  const strings = []
  formatted = formatted.replace(/'(?:[^']|'')*'/g, (match) => {
    strings.push(match)
    return `__STRING_${strings.length - 1}__`
  })

  // Normalize whitespace (but preserve single spaces)
  formatted = formatted.replace(/\s+/g, ' ').trim()

  // Keywords that should start on a new line (no indent)
  const newlineKeywords = [
    'CREATE PROCEDURE', 'CREATE PROC', 'CREATE VIEW', 'CREATE FUNCTION',
    'ALTER PROCEDURE', 'ALTER PROC', 'ALTER VIEW', 'ALTER FUNCTION',
    'BEGIN', 'END', 'GO',
    'AS BEGIN'
  ]

  // Statement keywords - new line
  const statementKeywords = [
    'DECLARE', 'SET', 'EXEC', 'EXECUTE', 'PRINT',
    'IF', 'ELSE', 'WHILE', 'RETURN',
    'INSERT INTO', 'INSERT', 'UPDATE', 'DELETE',
    'SELECT', 'FROM', 'WHERE', 'ORDER BY', 'GROUP BY', 'HAVING',
    'INNER JOIN', 'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'LEFT JOIN', 'RIGHT JOIN',
    'FULL OUTER JOIN', 'FULL JOIN', 'CROSS JOIN', 'JOIN',
    'UNION ALL', 'UNION', 'EXCEPT', 'INTERSECT',
    'WITH'
  ]

  // Add newlines before major structure keywords
  for (const keyword of newlineKeywords) {
    const regex = new RegExp(`\\b(${keyword})\\b`, 'gi')
    formatted = formatted.replace(regex, '\n\n$1')
  }

  // Add newlines before statement keywords
  for (const keyword of statementKeywords) {
    const regex = new RegExp(`(?<![\\w@])\\b(${keyword})\\b`, 'gi')
    formatted = formatted.replace(regex, '\n$1')
  }

  // Handle AS after proc parameters (AS BEGIN should be together, then newline)
  formatted = formatted.replace(/\)\s*AS\s+BEGIN/gi, ')\nAS\nBEGIN')

  // Handle standalone AS for CTEs
  formatted = formatted.replace(/\)\s*AS\s*\(/gi, ') AS (')

  // Add newline and indent after SELECT
  formatted = formatted.replace(/\bSELECT\s+/gi, 'SELECT\n    ')

  // Put each column/parameter on its own line after SELECT (comma followed by identifier)
  formatted = formatted.replace(/,\s*(?=[@\w\[])/g, ',\n    ')

  // Indent JOIN conditions
  formatted = formatted.replace(/\bON\s+/gi, '\n        ON ')

  // Indent AND/OR in WHERE clauses
  formatted = formatted.replace(/\bAND\s+/gi, '\n        AND ')
  formatted = formatted.replace(/\bOR\s+/gi, '\n        OR ')

  // Clean up multiple newlines (max 2)
  formatted = formatted.replace(/\n{3,}/g, '\n\n')

  // Remove leading newlines
  formatted = formatted.replace(/^\n+/, '')

  // Restore string literals
  strings.forEach((str, i) => {
    formatted = formatted.replace(`__STRING_${i}__`, str)
  })

  // Restore block comments (with newlines around them for readability)
  blockComments.forEach((comment, i) => {
    formatted = formatted.replace(`__BLOCK_COMMENT_${i}__`, '\n' + comment + '\n')
  })

  // Final cleanup
  formatted = formatted.replace(/^\n+/, '').trim()

  return formatted
}

function NodeDetails({ node, onClose }) {
  const [definition, setDefinition] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const abortControllerRef = useRef(null)

  const handleCopy = async () => {
    if (formattedDefinition) {
      try {
        await navigator.clipboard.writeText(formattedDefinition)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (err) {
        console.error('Failed to copy:', err)
      }
    }
  }

  // Format the SQL definition
  const formattedDefinition = useMemo(() => {
    if (!definition) return null

    // Always use simple formatter for stored procedures - sql-formatter
    // doesn't handle T-SQL procedural code well
    return simpleFormatSql(definition)
  }, [definition])

  // Extract entity ID from node
  const getEntityId = useCallback((node) => {
    if (!node || !node.id) return null
    if (node.type !== 'PROC' && node.type !== 'VIEW' && node.type !== 'SHARED_DATASET') return null

    const match = node.id.match(/_(\d+)$/)
    return match ? parseInt(match[1], 10) : null
  }, [])

  // Fetch definition with retry logic
  const fetchDefinitionWithRetry = useCallback(async (nodeType, entityId, nodeName, attempt = 0) => {
    const MAX_RETRIES = 3
    const RETRY_DELAY = 500

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    const fetchFn = nodeType === 'PROC' ? getStoredProcedure
                   : nodeType === 'VIEW' ? getView
                   : getSharedDataset

    try {
      // Pass both ID and name for reliable lookup (name is used as fallback when IDs are stale)
      const response = await fetchFn(entityId, nodeName)
      // Check if request was aborted
      if (abortControllerRef.current?.signal.aborted) return

      console.log('NodeDetails: got response', response.data)
      setDefinition(response.data.definition || '')
      setError(null)
      setLoading(false)
    } catch (err) {
      // Don't update state if aborted
      if (err.name === 'CanceledError' || abortControllerRef.current?.signal.aborted) {
        return
      }

      console.error(`Error fetching definition (attempt ${attempt + 1}):`, err)

      if (attempt < MAX_RETRIES) {
        // Retry after delay
        setTimeout(() => {
          fetchDefinitionWithRetry(nodeType, entityId, nodeName, attempt + 1)
        }, RETRY_DELAY * (attempt + 1))
      } else {
        setError('Failed to load definition')
        setLoading(false)
      }
    }
  }, [])

  // Manual retry handler
  const handleRetry = useCallback(() => {
    const entityId = getEntityId(node)
    if (entityId && entityId > 0) {
      setLoading(true)
      setError(null)
      setRetryCount(prev => prev + 1)
      fetchDefinitionWithRetry(node.type, entityId, node.name, 0)
    }
  }, [node, getEntityId, fetchDefinitionWithRetry])

  useEffect(() => {
    // Reset state when node changes
    setDefinition(null)
    setError(null)
    setLoading(false)

    if (!node) return

    const entityId = getEntityId(node)
    console.log('NodeDetails: node clicked', { id: node.id, type: node.type, name: node.name, entityId })

    if (entityId && entityId > 0) {
      setLoading(true)
      fetchDefinitionWithRetry(node.type, entityId, node.name, 0)
    }

    return () => {
      // Cancel pending request on cleanup
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [node?.id, node?.type, getEntityId, fetchDefinitionWithRetry])

  if (!node) return null

  // Format name with schema prefix
  const displayName = node.schema && node.schema.trim() !== ''
    ? `${node.schema}.${node.name}`
    : node.name

  return (
    <div className="node-details-overlay" onClick={onClose}>
      <div className="node-details" onClick={e => e.stopPropagation()}>
        <div className="details-header">
          <h3>{displayName}</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="details-body">
          <div className="detail-row">
            <span className="label">Type:</span>
            <span className={`type-badge ${node.type?.toLowerCase()}`}>
              {node.type}
            </span>
          </div>

          {node.server && (
            <div className="detail-row">
              <span className="label">Server:</span>
              <span>{node.server}</span>
            </div>
          )}

          {node.database && (
            <div className="detail-row">
              <span className="label">Database:</span>
              <span>{node.database}</span>
            </div>
          )}

          {node.schema && (
            <div className="detail-row">
              <span className="label">Schema:</span>
              <span>{node.schema}</span>
            </div>
          )}

          {node.sourceType && (
            <div className="detail-row">
              <span className="label">Location:</span>
              <span className={`source-type ${node.sourceType?.toLowerCase()}`}>
                {node.sourceType}
              </span>
            </div>
          )}

          {node.hasPk != null && (
            <div className="detail-row">
              <span className="label">Has Primary Key:</span>
              <span>{node.hasPk ? 'Yes' : 'No'}</span>
            </div>
          )}

          {/* Show definition for PROC, VIEW, and SHARED_DATASET nodes */}
          {(node.type === 'PROC' || node.type === 'VIEW' || node.type === 'SHARED_DATASET') && (
            <div className="definition-section">
              <div className="definition-header">
                <h4>Definition</h4>
                {formattedDefinition && (
                  <button
                    className={`copy-btn ${copied ? 'copied' : ''}`}
                    onClick={handleCopy}
                  >
                    {copied ? 'Copied!' : 'Copy SQL'}
                  </button>
                )}
              </div>
              {loading && <p className="loading-text">Loading...</p>}
              {error && (
                <div className="error-container">
                  <p className="error-text">{error}</p>
                  <button className="retry-btn" onClick={handleRetry}>
                    Retry
                  </button>
                </div>
              )}
              {formattedDefinition && (
                <pre className="sql-definition">{formattedDefinition}</pre>
              )}
              {!loading && !error && !definition && (
                <p className="no-definition">No definition available</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default NodeDetails
