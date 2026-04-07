import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'

function FlowDiagram({ data, onNodeClick }) {
  const svgRef = useRef(null)

  useEffect(() => {
    if (!data || !data.nodes || !data.edges) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth || 900
    const height = 500
    const margin = { top: 40, right: 40, bottom: 40, left: 40 }

    svg.attr('viewBox', [0, 0, width, height])

    // Color scale by node type
    const colorScale = {
      REPORT: '#4CAF50',
      DATASET: '#2196F3',
      SHARED_DATASET: '#00BCD4',  // Cyan for shared datasets
      PROC: '#FF9800',
      VIEW: '#9C27B0',
      TABLE: '#F44336',
      // Error types (red/gray for missing metadata)
      PROC_NOT_FOUND: '#c62828',
      SHARED_DATASET_NOT_FOUND: '#c62828',
      TABLE_NOT_FOUND: '#c62828',
      VIEW_NOT_FOUND: '#c62828',
      LINKED_SERVER_UNKNOWN: '#c62828'
    }

    // Map error types to their base type for layout purposes
    const getBaseType = (type) => {
      const typeMap = {
        'PROC_NOT_FOUND': 'PROC',
        'SHARED_DATASET_NOT_FOUND': 'SHARED_DATASET',
        'TABLE_NOT_FOUND': 'TABLE',
        'VIEW_NOT_FOUND': 'VIEW',
        'LINKED_SERVER_UNKNOWN': 'TABLE'
      }
      return typeMap[type] || type
    }

    // Group nodes by type for hierarchical layout (Tables first, Report last)
    const typeOrder = ['TABLE', 'VIEW', 'PROC', 'SHARED_DATASET', 'DATASET', 'REPORT']
    const nodesByType = {}
    data.nodes.forEach(node => {
      // Map error types to base types for layout
      const baseType = getBaseType(node.type)
      if (!nodesByType[baseType]) nodesByType[baseType] = []
      nodesByType[baseType].push(node)
    })

    // Calculate positions
    const layerWidth = (width - margin.left - margin.right) / typeOrder.length
    const nodePositions = {}

    typeOrder.forEach((type, layerIndex) => {
      const nodesInLayer = nodesByType[type] || []
      const layerHeight = height - margin.top - margin.bottom
      const nodeSpacing = layerHeight / (nodesInLayer.length + 1)

      nodesInLayer.forEach((node, nodeIndex) => {
        nodePositions[node.id] = {
          x: margin.left + layerIndex * layerWidth + layerWidth / 2,
          y: margin.top + (nodeIndex + 1) * nodeSpacing,
          ...node
        }
      })
    })

    const g = svg.append('g')

    // Add zoom
    svg.call(d3.zoom()
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.5, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      }))

    // Arrow marker
    svg.append('defs').append('marker')
      .attr('id', 'flow-arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .append('path')
      .attr('d', 'M 0,-5 L 10,0 L 0,5')
      .attr('fill', '#999')

    // Discovery method colors for edges
    const discoveryColors = {
      'BOTH': '#4CAF50',       // Green - high confidence
      'SQL_SERVER': '#2196F3', // Blue - from SQL Server
      'REGEX': '#999'          // Gray - from regex only
    }

    // Draw edges as curved lines
    const linkGenerator = d3.linkHorizontal()
      .x(d => d.x)
      .y(d => d.y)

    const links = g.append('g')
      .attr('class', 'links')
      .selectAll('g')
      .data(data.edges)
      .enter()
      .append('g')

    links.append('path')
      .attr('d', d => {
        const source = nodePositions[d.source]
        const target = nodePositions[d.target]
        if (!source || !target) return null
        return linkGenerator({ source, target })
      })
      .attr('fill', 'none')
      .attr('stroke', d => discoveryColors[d.discoveryMethod] || '#999')
      .attr('stroke-width', d => d.discoveryMethod === 'BOTH' ? 3 : 2)
      .attr('stroke-opacity', 0.7)
      .attr('marker-end', 'url(#flow-arrowhead)')

    // Edge tooltips showing discovery method
    links.append('title')
      .text(d => {
        const method = d.discoveryMethod || 'REGEX'
        const methodLabel = {
          'BOTH': 'Found by BOTH SQL Server & Regex (High Confidence)',
          'SQL_SERVER': 'Found by SQL Server only (Regex missed)',
          'REGEX': 'Found by Regex only (Dynamic SQL or Linked Server)'
        }
        return `${d.relationship}\n${methodLabel[method] || method}`
      })

    // Draw nodes
    const nodes = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(Object.values(nodePositions))
      .enter()
      .append('g')
      .attr('transform', d => `translate(${d.x},${d.y})`)

    // Error types for special styling
    const errorTypes = ['PROC_NOT_FOUND', 'SHARED_DATASET_NOT_FOUND', 'TABLE_NOT_FOUND', 'VIEW_NOT_FOUND', 'LINKED_SERVER_UNKNOWN']

    // Clickable types (nodes that have details to show)
    const clickableTypes = ['PROC', 'VIEW', 'SHARED_DATASET']

    // Node rectangles (clickable for PROC, VIEW, SHARED_DATASET)
    nodes.append('rect')
      .attr('x', -50)
      .attr('y', -15)
      .attr('width', 100)
      .attr('height', 30)
      .attr('rx', 5)
      .attr('fill', d => colorScale[d.type] || '#666')
      .attr('stroke', d => errorTypes.includes(d.type) ? '#c62828' : '#fff')
      .attr('stroke-width', d => errorTypes.includes(d.type) ? 3 : 2)
      .attr('stroke-dasharray', d => errorTypes.includes(d.type) ? '5,3' : 'none')
      .attr('cursor', d => clickableTypes.includes(d.type) ? 'pointer' : 'default')
      .on('click', (event, d) => {
        if (clickableTypes.includes(d.type) && onNodeClick) {
          onNodeClick(d)
        }
      })
      .on('mouseover', function(event, d) {
        if (clickableTypes.includes(d.type)) {
          d3.select(this).attr('stroke', '#FFD700').attr('stroke-width', 3)
        }
      })
      .on('mouseout', function(event, d) {
        const isError = errorTypes.includes(d.type)
        d3.select(this)
          .attr('stroke', isError ? '#c62828' : '#fff')
          .attr('stroke-width', isError ? 3 : 2)
      })

    // Node labels
    nodes.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 4)
      .attr('font-size', '10px')
      .attr('fill', '#fff')
      .text(d => {
        const name = d.name || ''
        return name.length > 15 ? name.substring(0, 12) + '...' : name
      })

    // Tooltips
    nodes.append('title')
      .text(d => {
        if (errorTypes.includes(d.type)) {
          const baseType = d.type.replace('_NOT_FOUND', '').replace('_UNKNOWN', '')
          return `${baseType}: ${d.name}\n⚠️ NOT FOUND - Missing from metadata`
        }
        return `${d.type}: ${d.name}${d.server ? `\nServer: ${d.server}` : ''}`
      })

    // Layer labels
    typeOrder.forEach((type, i) => {
      if (nodesByType[type] && nodesByType[type].length > 0) {
        svg.append('text')
          .attr('x', margin.left + i * layerWidth + layerWidth / 2)
          .attr('y', 20)
          .attr('text-anchor', 'middle')
          .attr('font-size', '12px')
          .attr('font-weight', 'bold')
          .attr('fill', colorScale[type])
          .text(type)
      }
    })

  }, [data])

  return (
    <svg ref={svgRef} className="flow-diagram" />
  )
}

export default FlowDiagram
