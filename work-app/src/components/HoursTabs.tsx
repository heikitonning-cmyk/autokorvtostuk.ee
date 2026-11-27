import Link from 'next/link'
export function HoursTabs({view}:{view:'workers'|'days'}) {
  return <nav className="segmented hours-tabs" aria-label="Tundide vaated"><Link href="/manager/time" className={view==='workers'?'active':''}>Töölised</Link><Link href="/manager/time?view=days" className={view==='days'?'active':''}>Päevad</Link></nav>
}
