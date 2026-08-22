import Link from 'next/link'
import type { ReactNode } from 'react'
import type { AppUser } from '@/lib/domain'

export function AppShell({ user, children }: { user: AppUser; children: ReactNode }) {
  const manager = user.role === 'manager'
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="app-brand" href={manager ? '/manager' : '/operator'}><span>EK</span><strong>Euro Kapital</strong></Link>
        <div className="user-chip"><span>{user.name}</span><a href="/logout">Välju</a></div>
      </header>
      <main className="app-main">{children}</main>
      <nav className="bottom-nav" aria-label="Rakenduse navigatsioon">
        {manager ? <>
          <Link href="/manager">Juhtimispult</Link>
          <Link href="/manager/calendar">Kalender</Link>
          <Link href="/manager/customers">Kliendid</Link>
          <Link href="/manager/settings">Seaded</Link>
        </> : <>
          <Link href="/operator">Täna</Link>
        </>}
      </nav>
    </div>
  )
}
