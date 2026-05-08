import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'

// Node type configurations
const NODE_CONFIG = {
  REPORT: { color: '#4CAF50', shape: 'roundedRect', label: 'Report' },
  DATASET: { color: '#2196F3', shape: 'ellipse', label: 'Dataset' },
  SHARED_DATASET: { color: '#00BCD4', shape: 'ellipse', label: 'Shared Dataset' },
  PROC: { color: '#FF9800', shape: 'diamond', label: 'Stored Proc' },
  VIEW: { color: '#9C27B0', shape: 'hexagon', label: 'View' },
  TABLE: { color: '#F44336', shape: 'circle', label: 'Table' },
  // Power BI types
  PBI_REPORT: { color: '#4FC3F7', shape: 'roundedRect', label: 'PBI Report' },
  PBI_TABLE: { color: '#BA68C8', shape: 'ellipse', label: 'PBI Table' },
  // Error types
  PROC_NOT_FOUND: { color: '#c62828', shape: 'diamond', label: 'Proc (Not Found)', dashed: true },
  SHARED_DATASET_NOT_FOUND: { color: '#c62828', shape: 'ellipse', label: 'Shared Dataset (Not Found)', dashed: true },
  TABLE_NOT_FOUND: { color: '#c62828', shape: 'circle', label: 'Table (Not Found)', dashed: true },
  VIEW_NOT_FOUND: { color: '#c62828', shape: 'hexagon', label: 'View (Not Found)', dashed: true },
  LINKED_SERVER_UNKNOWN: { color: '#c62828', shape: 'circle', label: 'Linked Server (Unknown)', dashed: true }
}

// Type order for x-positioning (reports left, tables right - matches CSV column order and data flow direction)
const TYPE_ORDER = ['REPORT', 'PBI_REPORT', 'DATASET', 'PBI_TABLE', 'SHARED_DATASET', 'PROC', 'VIEW', 'TABLE']

// Map error types to base types for positioning
const getBaseType = (type) => {
  const typeMap = {
    'PROC_NOT_FOUND': 'PROC',
    'SHARED_DATASET_NOT_FOUND': 'SHARED_DATASET',
    'TABLE_NOT_FOUND': 'TABLE',
    'VIEW_NOT_FOUND': 'VIEW',
    'LINKED_SERVER_UNKNOWN': 'TABLE',
    'PBI_REPORT': 'REPORT',
    'PBI_TABLE': 'DATASET'
  }
  return typeMap[type] || type
}

// Draw shape paths
function drawShape(shape, size) {
  const s = size
  switch (shape) {
    case 'circle':
      return d3.arc()({
        innerRadius: 0,
        outerRadius: s,
        startAngle: 0,
        endAngle: 2 * Math.PI
      })
    case 'diamond':
      return `M 0 ${-s} L ${s} 0 L 0 ${s} L ${-s} 0 Z`
    case 'hexagon':
      const h = s * 0.866 // sin(60)
      return `M ${-s} 0 L ${-s/2} ${-h} L ${s/2} ${-h} L ${s} 0 L ${s/2} ${h} L ${-s/2} ${h} Z`
    case 'ellipse':
      return `M ${-s * 1.3} 0 A ${s * 1.3} ${s * 0.8} 0 1 1 ${s * 1.3} 0 A ${s * 1.3} ${s * 0.8} 0 1 1 ${-s * 1.3} 0`
    case 'roundedRect':
      const w = s * 1.5
      const h2 = s * 0.8
      const r = 5
      return `M ${-w + r} ${-h2} L ${w - r} ${-h2} Q ${w} ${-h2} ${w} ${-h2 + r} L ${w} ${h2 - r} Q ${w} ${h2} ${w - r} ${h2} L ${-w + r} ${h2} Q ${-w} ${h2} ${-w} ${h2 - r} L ${-w} ${-h2 + r} Q ${-w} ${-h2} ${-w + r} ${-h2} Z`
    default:
      return d3.arc()({
        innerRadius: 0,
        outerRadius: s,
        startAngle: 0,
        endAngle: 2 * Math.PI
      })
  }
}

// Generate curved path between two points
function getCurvedPath(source, target) {
  const dx = target.x - source.x
  const dy = target.y - source.y
  const dr = Math.sqrt(dx * dx + dy * dy)

  // If same type (e.g., VIEW→VIEW), use more curve for clarity
  const sameType = getBaseType(source.type) === getBaseType(target.type)
  const curveAmount = sameType ? dr * 0.3 : dr * 0.1

  // Control point offset for curve
  const midX = (source.x + target.x) / 2
  const midY = (source.y + target.y) / 2

  // Perpendicular offset for control point
  const perpX = -dy / dr * curveAmount
  const perpY = dx / dr * curveAmount

  const ctrlX = midX + perpX
  const ctrlY = midY + perpY

  return `M ${source.x} ${source.y} Q ${ctrlX} ${ctrlY} ${target.x} ${target.y}`
}

function ForceLineageGraph({ data, onNodeClick }) {
  const svgRef = useRef(null)

  useEffect(() => {
    if (!data || !data.nodes || !data.edges) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth || 900
    const height = svgRef.current.clientHeight || 600
    const margin = { top: 60, right: 40, bottom: 40, left: 40 }

    svg.attr('viewBox', [0, 0, width, height])

    // Count nodes per type for better y-distribution
    const nodesByType = {}
    data.nodes.forEach(node => {
      const baseType = getBaseType(node.type)
      if (!nodesByType[baseType]) nodesByType[baseType] = []
      nodesByType[baseType].push(node)
    })

    // Create nodes array with initial positions based on type
    const layerWidth = (width - margin.left - margin.right) / TYPE_ORDER.length
    const nodes = data.nodes.map(node => {
      const baseType = getBaseType(node.type)
      const layerIndex = TYPE_ORDER.indexOf(baseType)
      const nodesInLayer = nodesByType[baseType] || []
      const indexInLayer = nodesInLayer.indexOf(node)
      const layerHeight = height - margin.top - margin.bottom
      const spacing = layerHeight / (nodesInLayer.length + 1)

      return {
        ...node,
        x: margin.left + (layerIndex >= 0 ? layerIndex : 3) * layerWidth + layerWidth / 2,
        y: margin.top + (indexInLayer + 1) * spacing
      }
    })

    // Create links array
    const nodeById = new Map(nodes.map(n => [n.id, n]))
    const links = data.edges
      .map(e => ({
        source: nodeById.get(e.source),
        target: nodeById.get(e.target),
        relationship: e.relationship,
        discoveryMethod: e.discoveryMethod
      }))
      .filter(l => l.source && l.target)

    // Create container group for zoom/pan
    const g = svg.append('g')

    // Add zoom behavior
    const zoom = d3.zoom()
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    svg.call(zoom)

    // Arrow markers for edges (multiple colors)
    const defs = svg.append('defs')
    const markerColors = {
      'default': '#666',
      'BOTH': '#4CAF50',
      'SQL_SERVER': '#2196F3',
      'REGEX': '#999',
      'DYNAMIC': '#FF9800',
      'highlight': '#FFD700'
    }

    Object.entries(markerColors).forEach(([key, color]) => {
      defs.append('marker')
        .attr('id', `arrow-${key}`)
        .attr('viewBox', '-0 -5 10 10')
        .attr('refX', 25)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 8)
        .attr('markerHeight', 8)
        .append('path')
        .attr('d', 'M 0,-5 L 10,0 L 0,5')
        .attr('fill', color)
    })

    // Discovery method colors for edges
    const discoveryColors = {
      'BOTH': '#4CAF50',
      'SQL_SERVER': '#2196F3',
      'REGEX': '#666',
      'DYNAMIC': '#FF9800'
    }

    // Create force simulation with stronger separation for same-type nodes
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(100).strength(0.7))
      .force('charge', d3.forceManyBody().strength(-500))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50))
      // Stronger x-force to keep type groupings
      .force('x', d3.forceX(d => {
        const baseType = getBaseType(d.type)
        const layerIndex = TYPE_ORDER.indexOf(baseType)
        return margin.left + (layerIndex >= 0 ? layerIndex : 3) * layerWidth + layerWidth / 2
      }).strength(0.3))
      // Spread nodes vertically
      .force('y', d3.forceY(height / 2).strength(0.02))

    // Draw edges as curved paths
    const linkGroup = g.append('g').attr('class', 'links')
    const link = linkGroup.selectAll('path')
      .data(links)
      .enter()
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', d => discoveryColors[d.discoveryMethod] || '#666')
      .attr('stroke-width', d => d.discoveryMethod === 'BOTH' ? 3 : 2)
      .attr('stroke-opacity', 0.8)
      .attr('marker-end', d => `url(#arrow-${d.discoveryMethod || 'default'})`)
      .attr('class', 'link-path')

    // Edge tooltips
    link.append('title')
      .text(d => {
        const methodLabel = {
          'BOTH': 'Found by BOTH SQL Server & Regex (High Confidence)',
          'SQL_SERVER': 'Found by SQL Server only',
          'REGEX': 'Found by Regex only',
          'DYNAMIC': 'Dynamic SQL reference'
        }
        return `${d.source.name} → ${d.target.name}\n${d.relationship}\n${methodLabel[d.discoveryMethod] || d.discoveryMethod}`
      })

    // Draw nodes
    const nodeGroup = g.append('g').attr('class', 'nodes')
    const node = nodeGroup.selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended))

    // Clickable types
    const clickableTypes = ['PROC', 'VIEW', 'SHARED_DATASET']

    // Node shapes
    node.append('path')
      .attr('d', d => {
        const config = NODE_CONFIG[d.type] || NODE_CONFIG.TABLE
        return drawShape(config.shape, 20)
      })
      .attr('fill', d => {
        const config = NODE_CONFIG[d.type] || NODE_CONFIG.TABLE
        return config.color
      })
      .attr('stroke', d => {
        const config = NODE_CONFIG[d.type] || NODE_CONFIG.TABLE
        return config.dashed ? '#c62828' : '#fff'
      })
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', d => {
        const config = NODE_CONFIG[d.type] || NODE_CONFIG.TABLE
        return config.dashed ? '5,3' : 'none'
      })
      .attr('cursor', d => clickableTypes.includes(d.type) ? 'pointer' : 'default')
      .on('click', (event, d) => {
        if (clickableTypes.includes(d.type) && onNodeClick) {
          onNodeClick(d)
        }
      })
      .on('mouseover', function(event, d) {
        // Highlight node
        d3.select(this).attr('stroke', '#FFD700').attr('stroke-width', 3)

        // Highlight connected edges
        link.each(function(l) {
          if (l.source.id === d.id || l.target.id === d.id) {
            d3.select(this)
              .attr('stroke', '#FFD700')
              .attr('stroke-width', 4)
              .attr('stroke-opacity', 1)
              .attr('marker-end', 'url(#arrow-highlight)')
          } else {
            d3.select(this).attr('stroke-opacity', 0.2)
          }
        })

        // Highlight connected nodes
        node.each(function(n) {
          const connected = links.some(l =>
            (l.source.id === d.id && l.target.id === n.id) ||
            (l.target.id === d.id && l.source.id === n.id)
          )
          if (!connected && n.id !== d.id) {
            d3.select(this).attr('opacity', 0.3)
          }
        })
      })
      .on('mouseout', function(event, d) {
        const config = NODE_CONFIG[d.type] || NODE_CONFIG.TABLE
        d3.select(this)
          .attr('stroke', config.dashed ? '#c62828' : '#fff')
          .attr('stroke-width', 2)

        // Reset edge styles
        link.each(function(l) {
          d3.select(this)
            .attr('stroke', discoveryColors[l.discoveryMethod] || '#666')
            .attr('stroke-width', l.discoveryMethod === 'BOTH' ? 3 : 2)
            .attr('stroke-opacity', 0.8)
            .attr('marker-end', `url(#arrow-${l.discoveryMethod || 'default'})`)
        })

        // Reset node opacity
        node.attr('opacity', 1)
      })

    // Node labels
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 35)
      .attr('font-size', '10px')
      .attr('fill', '#333')
      .attr('pointer-events', 'none')
      .text(d => {
        // Add schema prefix when available
        const displayName = d.schema && d.schema.trim() !== ''
          ? `${d.schema}.${d.name}`
          : d.name || ''
        return displayName.length > 20 ? displayName.substring(0, 17) + '...' : displayName
      })

    // Node tooltips
    node.append('title')
      .text(d => {
        const config = NODE_CONFIG[d.type] || NODE_CONFIG.TABLE
        // Include schema prefix in tooltip
        const displayName = d.schema && d.schema.trim() !== ''
          ? `${d.schema}.${d.name}`
          : d.name
        let tooltip = `${config.label}: ${displayName}`
        if (d.server) tooltip += `\nServer: ${d.server}`
        if (d.database) tooltip += `\nDatabase: ${d.database}`
        if (d.schema) tooltip += `\nSchema: ${d.schema}`
        if (config.dashed) tooltip += `\n⚠️ NOT FOUND - Missing from metadata`
        return tooltip
      })

    // Drag functions
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    }

    function dragged(event, d) {
      d.fx = event.x
      d.fy = event.y
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0)
      d.fx = null
      d.fy = null
    }

    // Update positions on tick
    simulation.on('tick', () => {
      link.attr('d', d => getCurvedPath(d.source, d.target))
      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    // Cleanup
    return () => {
      simulation.stop()
    }

  }, [data, onNodeClick])

  return (
    <svg ref={svgRef} className="force-lineage-graph" />
  )
}

export default ForceLineageGraph
