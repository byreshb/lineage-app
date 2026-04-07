import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'

function LineageGraph({ data }) {
  const svgRef = useRef(null)

  useEffect(() => {
    if (!data || !data.nodes || !data.edges) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth || 800
    const height = 500

    // Set up SVG
    svg.attr('viewBox', [0, 0, width, height])

    // Color scale by node type
    const colorScale = {
      REPORT: '#4CAF50',
      DATASET: '#2196F3',
      PROC: '#FF9800',
      VIEW: '#9C27B0',
      TABLE: '#F44336'
    }

    // Create simulation
    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.edges)
        .id(d => d.id)
        .distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(40))

    // Add zoom behavior
    const g = svg.append('g')
    svg.call(d3.zoom()
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      }))

    // Draw edges
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(data.edges)
      .enter()
      .append('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#arrowhead)')

    // Arrow marker
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .append('path')
      .attr('d', 'M 0,-5 L 10,0 L 0,5')
      .attr('fill', '#999')

    // Draw nodes
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(data.nodes)
      .enter()
      .append('g')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended))

    // Node circles
    node.append('circle')
      .attr('r', 15)
      .attr('fill', d => colorScale[d.type] || '#666')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    // Node labels
    node.append('text')
      .attr('dy', 25)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', '#333')
      .text(d => d.name ? d.name.substring(0, 20) : '')

    // Tooltip
    node.append('title')
      .text(d => `${d.type}: ${d.name}${d.server ? `\nServer: ${d.server}` : ''}`)

    // Simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)

      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })

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

    // Legend
    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', 'translate(20, 20)')

    const types = ['REPORT', 'DATASET', 'PROC', 'VIEW', 'TABLE']
    types.forEach((type, i) => {
      const legendItem = legend.append('g')
        .attr('transform', `translate(0, ${i * 20})`)

      legendItem.append('circle')
        .attr('r', 6)
        .attr('fill', colorScale[type])

      legendItem.append('text')
        .attr('x', 12)
        .attr('y', 4)
        .attr('font-size', '11px')
        .text(type)
    })

    return () => {
      simulation.stop()
    }
  }, [data])

  return (
    <svg ref={svgRef} className="lineage-graph" />
  )
}

export default LineageGraph
