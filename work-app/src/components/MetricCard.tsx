import Link from 'next/link'

export function MetricCard({ label, value, note, href }: { label: string; value: string; note?: string; href?:string }) {
  const content=<><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</>
  return href ? <Link href={href} className="metric-card dashboard-link">{content}</Link> : <div className="metric-card">{content}</div>
}
