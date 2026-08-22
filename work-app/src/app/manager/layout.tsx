import type { ReactNode } from 'react'
import { AppShell } from '@/components/AppShell'
import { requireUser } from '@/lib/session'

export default async function ManagerLayout({ children }: { children: ReactNode }) {
  const user = await requireUser('manager')
  return <AppShell user={user}>{children}</AppShell>
}
