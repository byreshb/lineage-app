import React from 'react'

// Node type configurations matching ForceLineageGraph
const LEGEND_ITEMS = [
  { type: 'REPORT', color: '#4CAF50', shape: 'roundedRect', label: 'SSRS Report' },
  { type: 'PBI_REPORT', color: '#4FC3F7', shape: 'roundedRect', label: 'PBI Report' },
  { type: 'DATASET', color: '#2196F3', shape: 'ellipse', label: 'Dataset' },
  { type: 'PBI_TABLE', color: '#BA68C8', shape: 'ellipse', label: 'PBI Table' },
  { type: 'SHARED_DATASET', color: '#00BCD4', shape: 'ellipse', label: 'Shared Dataset' },
  { type: 'PROC', color: '#FF9800', shape: 'diamond', label: 'Stored Proc' },
  { type: 'VIEW', color: '#9C27B0', shape: 'hexagon', label: 'View' },
  { type: 'TABLE', color: '#F44336', shape: 'circle', label: 'Table' },
]

// SVG path generators for legend shapes
function getShapePath(shape) {
  const s = 10 // size
  switch (shape) {
    case 'circle':
      return { type: 'circle', r: s }
    case 'diamond':
      return { type: 'path', d: `M 0 ${-s} L ${s} 0 L 0 ${s} L ${-s} 0 Z` }
    case 'hexagon':
      const h = s * 0.866
      return { type: 'path', d: `M ${-s} 0 L ${-s/2} ${-h} L ${s/2} ${-h} L ${s} 0 L ${s/2} ${h} L ${-s/2} ${h} Z` }
    case 'ellipse':
      return { type: 'ellipse', rx: s * 1.2, ry: s * 0.7 }
    case 'roundedRect':
      const w = s * 1.3
      const h2 = s * 0.7
      const r = 3
      return { type: 'path', d: `M ${-w + r} ${-h2} L ${w - r} ${-h2} Q ${w} ${-h2} ${w} ${-h2 + r} L ${w} ${h2 - r} Q ${w} ${h2} ${w - r} ${h2} L ${-w + r} ${h2} Q ${-w} ${h2} ${-w} ${h2 - r} L ${-w} ${-h2 + r} Q ${-w} ${-h2} ${-w + r} ${-h2} Z` }
    default:
      return { type: 'circle', r: s }
  }
}

function ShapeIcon({ shape, color }) {
  const shapeConfig = getShapePath(shape)
  const size = 24

  return (
    <svg width={size} height={size} viewBox={`-12 -12 24 24`}>
      {shapeConfig.type === 'circle' && (
        <circle r={shapeConfig.r} fill={color} stroke="#fff" strokeWidth="1.5" />
      )}
      {shapeConfig.type === 'ellipse' && (
        <ellipse rx={shapeConfig.rx} ry={shapeConfig.ry} fill={color} stroke="#fff" strokeWidth="1.5" />
      )}
      {shapeConfig.type === 'path' && (
        <path d={shapeConfig.d} fill={color} stroke="#fff" strokeWidth="1.5" />
      )}
    </svg>
  )
}

function LineageLegend() {
  return (
    <div className="lineage-legend">
      <span className="legend-title">Node Types:</span>
      <div className="legend-items">
        {LEGEND_ITEMS.map(item => (
          <div key={item.type} className="legend-item">
            <ShapeIcon shape={item.shape} color={item.color} />
            <span className="legend-label">{item.label}</span>
          </div>
        ))}
        <div className="legend-item legend-not-found">
          <svg width="24" height="24" viewBox="-12 -12 24 24">
            <circle r="10" fill="#c62828" stroke="#c62828" strokeWidth="1.5" strokeDasharray="4,2" />
          </svg>
          <span className="legend-label">Not Found (dashed)</span>
        </div>
      </div>
    </div>
  )
}

export default LineageLegend
