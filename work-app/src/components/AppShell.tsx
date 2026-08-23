import Link from 'next/link'
import type { ReactNode } from 'react'
import type { AppUser } from '@/lib/domain'
import type { AppView } from '@/lib/auth'

export function AppShell({ user, view, children }: { user: AppUser; view: AppView; children: ReactNode }) {
  const managerAccount = user.role === 'manager'
  const managerView = managerAccount && view === 'manager'
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="app-brand" href={managerView ? '/manager' : '/operator'}><span>EK</span><strong>Euro Kapital</strong></Link>
        {managerAccount && <div className="segmented" style={{ background: '#344054' }} aria-label="Vaate valik">
          <Link href="/manager" className={view === 'manager' ? 'active' : ''} style={view === 'manager' ? { color: '#111827' } : undefined}>Juht</Link>
          <Link href="/operator" className={view === 'worker' ? 'active' : ''} style={view === 'worker' ? { color: '#111827' } : undefined}>Kasutaja</Link>
        </div>}
        <div className="user-chip"><span>{user.name}</span><a href="/logout">Välju</a></div>
      </header>
      <main className="app-main">{children}</main>
      <nav className="bottom-nav" aria-label="Rakenduse navigatsioon">
        {managerView ? <>
          <Link href="/manager">Juhtimispult</Link>
          <Link href="/manager/calendar">Kalender</Link>
          <Link href="/manager/customers">Kliendid</Link>
          <Link href="/manager/users">Kasutajad</Link>
          <Link href="/manager/settings">Seaded</Link>
        </> : <>
          <Link href="/operator">Tööd</Link>
        </>}
      </nav>
    </div>
  )
}
