import React from 'react';

export type Column = {
  key: string;
  title: string;
  render?: (row: any) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
};

export default function DataTable({ columns, data, loading }: { columns: Column[]; data: any[]; loading?: boolean }) {
  return (
    <div>
      {/* Desktop / Tablet: regular table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground uppercase text-xs tracking-wider">
              {columns.map(col => (
                <th key={col.key} className={`px-4 py-3 text-${col.align ?? 'left'}`}>{col.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} className="text-center py-12 text-muted-foreground">Loading...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={columns.length} className="text-center py-12 text-muted-foreground">No records</td></tr>
            ) : data.map((row) => (
              <tr key={row.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                {columns.map(col => (
                  <td key={col.key} className={`px-4 py-3 text-${col.align ?? 'left'}`}>{col.render ? col.render(row) : row[col.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <div className="md:hidden space-y-2">
        {loading ? (
          <div className="p-4 text-center text-muted-foreground">Loading...</div>
        ) : data.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">No records</div>
        ) : data.map((row) => (
          <div key={row.id} className="p-3 border border-border rounded-md bg-background/50">
            {columns.map(col => (
              <div key={col.key} className="flex justify-between py-1">
                <div className="text-xs text-muted-foreground">{col.title}</div>
                <div className="text-sm font-medium">{col.render ? col.render(row) : row[col.key]}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
