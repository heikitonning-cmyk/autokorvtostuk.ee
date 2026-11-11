import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireView } from '@/lib/session'
import { getOperatorJob } from '@/lib/queries'
import { SimpleJobDetails } from '@/components/SimpleJobDetails'

export default async function OperatorJobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireView('worker')
  const { id } = await params
  let job: any
  try { job = await getOperatorJob(id) } catch { notFound() }
  return <div className="page narrow stack-lg"><Link className="back-link" href="/operator">← Tööplaani</Link><SimpleJobDetails job={job} /></div>
}
