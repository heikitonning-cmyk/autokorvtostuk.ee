export function MetricCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>
}
