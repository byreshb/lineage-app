import React from 'react'

function TableList({ tables }) {
  if (!tables || tables.length === 0) {
    return (
      <div className="empty-state">
        No source tables found.
      </div>
    )
  }

  return (
    <div className="table-list">
      <table>
        <thead>
          <tr>
            <th>In SQL2(D300SQLDW01)</th>
            <th>SQL2(D300SQLDW01) Has PK</th>
            <th>Metadata Table</th>
            <th>Metadata Schema</th>
            <th>Metadata Database</th>
            <th>Metadata Server</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          {tables.map((table, index) => {
            const statusClass = table.status === 'No' || table.status === 'NOT_FOUND' ? 'status-not-found' :
                               table.status === 'NO_TABLES' ? 'status-no-tables' : 'status-ok';
            const rowClass = table.status === 'No' || table.status === 'NOT_FOUND' ? 'not-found-row' :
                            table.status === 'NO_TABLES' ? 'no-tables-row' : '';

            return (
              <tr key={index} className={rowClass}>
                <td>
                  <span className={`status-badge ${statusClass}`}>
                    {table.status || 'Yes'}
                  </span>
                </td>
                <td className="has-pk">
                  {table.hasPk != null ? (table.hasPk ? 'Yes' : 'No') : '-'}
                </td>
                <td className="table-name">{table.tableName}</td>
                <td>{table.schemaName || '-'}</td>
                <td>{table.databaseName || '-'}</td>
                <td>{table.server || '-'}</td>
                <td>
                  <span className={`source-type ${table.sourceType?.toLowerCase()}`}>
                    {table.sourceType || 'UNKNOWN'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  )
}

export default TableList
