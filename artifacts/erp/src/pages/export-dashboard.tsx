import { useEffect } from "react";
import { useGetDashboardSummary } from "@workspace/api-client-react";

export default function ExportDashboard() {
  const { data: summary } = useGetDashboardSummary();

  useEffect(() => {
    document.title = "AlGhani - Export Dashboard";
  }, []);

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", padding: 24, color: "#1A1F23" }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>AlGhani Report Snapshot</h1>
      <div style={{ display: "flex", gap: 20, marginBottom: 12 }}>
        <div style={{ padding: 16, borderRadius: 8, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", minWidth: 180 }}>
          <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase" }}>Revenue</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Rs. {summary?.totalRevenue?.toLocaleString() || 0}</div>
        </div>
        <div style={{ padding: 16, borderRadius: 8, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", minWidth: 180 }}>
          <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase" }}>Gross Profit</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Rs. {summary?.grossProfit?.toLocaleString() || 0}</div>
        </div>
        <div style={{ padding: 16, borderRadius: 8, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", minWidth: 180 }}>
          <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase" }}>Net Profit</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Rs. {summary?.netProfit?.toLocaleString() || 0}</div>
        </div>
        <div style={{ padding: 16, borderRadius: 8, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", minWidth: 180 }}>
          <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase" }}>Products</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{summary?.totalProducts?.toLocaleString() || 0}</div>
        </div>
      </div>
      <p style={{ color: "#6b7280" }}>This page is optimized for export. Use the browser Print / Save as PDF or the app export buttons.</p>
    </div>
  );
}
