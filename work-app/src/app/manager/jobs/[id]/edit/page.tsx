import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/session'
import { getDispatchReferences, getJobDetail, getJobPayrollEntry } from '@/lib/queries'
import { SimpleJobForm } from '@/components/SimpleJobForm'

export default async function ManagerJobEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser('manager')
  const { id } = await params
  let job: any
  try { job = await getJobDetail(id) } catch { notFound() }
  const [refs, entry] = await Promise.all([getDispatchReferences(), getJobPayrollEntry(id)])
  return <div className="page narrow stack-lg"><div><p className="eyebrow">Tööplaan</p><h1>Muuda tööd</h1></div>
    <SimpleJobForm jobId={id} job={job} entry={entry} {...refs} />
  </div>
}
