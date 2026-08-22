import type { ReactNode } from 'react'
import { AppShell } from '@/components/AppShell'
import { requireUser } from '@/lib/session'

export default async function OperatorLayout({ children }: { children: ReactNode }) {
  const user = await requireUser('operator')
  return <AppShell user={user}>{children}</AppShell>
}
