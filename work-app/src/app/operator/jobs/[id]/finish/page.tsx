import { redirect } from 'next/navigation'
import { requireView } from '@/lib/session'
export default async function LegacyOperatorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireView('worker')
  const { id } = await params
  redirect(`/operator/jobs/${id}`)
}
