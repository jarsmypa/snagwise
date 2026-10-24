import { useMemo } from "react";
import { ClientSideRowModelModule, ModuleRegistry, TextFilterModule, themeQuartz, type ColDef, type ValueFormatterParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { formatCents, type Transaction } from "@snagwise/core";

// Only the modules this table uses, to keep the bundle small.
ModuleRegistry.registerModules([ClientSideRowModelModule, TextFilterModule]);

// Colors come from the app's CSS tokens, so the grid follows light and dark mode with the rest of the page.
const theme = themeQuartz.withParams({
  backgroundColor: "var(--surface)",
  foregroundColor: "var(--text)",
  borderColor: "var(--line)",
  headerBackgroundColor: "var(--bg)",
  accentColor: "var(--accent)",
  fontFamily: "inherit",
  fontSize: 14,
});

const money = (p: ValueFormatterParams<Transaction, number>) => (p.value == null ? "" : `$${formatCents(p.value)}`);

// Sortable, filterable spending table (AG Grid Community). Groups by category through the filter.
export function SpendingGrid({ rows }: { rows: Transaction[] }) {
  const columns = useMemo<ColDef<Transaction>[]>(
    () => [
      { field: "date", headerName: "Date", valueFormatter: (p) => (p.value ? String(p.value).slice(0, 10) : ""), sort: "desc", width: 120 },
      { field: "merchant", headerName: "Merchant", flex: 1, minWidth: 140, filter: true },
      { field: "category", headerName: "Category", width: 150, filter: true },
      { field: "amountCents", headerName: "Amount", valueFormatter: money, type: "rightAligned", width: 120 },
    ],
    [],
  );

  return (
    <div className="grid-wrap" style={{ height: Math.min(520, 56 + rows.length * 42) }}>
      <AgGridReact<Transaction> theme={theme} rowData={rows} columnDefs={columns} defaultColDef={{ sortable: true, resizable: true }} getRowId={(p) => p.data.id} />
    </div>
  );
}
