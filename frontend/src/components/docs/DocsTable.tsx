import type { ReactNode } from 'react'

export interface DocsTableColumn {
  header: string
  key?: string
}

interface DocsTableProps {
  headers: string[]
  rows: ReactNode[][]
  caption?: string
}

export function DocsTable({ headers, rows, caption }: DocsTableProps) {
  return (
    <div className="docs-table-wrap">
      {caption ? <div className="sr-only">{caption}</div> : null}
      <div style={{ overflowX: 'auto' }}>
        <table className="docs-table">
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header} scope="col">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    data-label={headers[cellIndex]}
                    className={cellIndex === 0 ? 'font-medium' : undefined}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
