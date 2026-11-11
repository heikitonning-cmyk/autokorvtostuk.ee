import type { ReactNode } from 'react'
import { AppShell } from '@/components/AppShell'
import { requireView } from '@/lib/session'

export default async function OperatorLayout({ children }: { children: ReactNode }) {
  const user = await requireView('worker')
  return <AppShell user={user} view="worker">{children}</AppShell>
}
