import { notFound, redirect } from 'next/navigation'
import { requireView } from '@/lib/session'
import { defaultPricing, getEditableReferenceData, getOperatorJob, getPricingSettings } from '@/lib/queries'
import { JobEditForm } from '@/components/JobEditForm'

const locked = new Set(['tehtud', 'vajab_jareltegevust', 'tuhistatud'])

export default async function WorkerJobEditPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireView('worker')
  const { id } = await params
  const query = await searchParams
  let job: any
  try { job = await getOperatorJob(id) } catch { notFound() }
  if (locked.has(job.status)) redirect(`/operator/jobs/${id}`)

  const [refs, currentPricing] = await Promise.all([getEditableReferenceData(), getPricingSettings()])
  const pricing = { ...defaultPricing, ...currentPricing, ...(job.price_snapshot_json ?? {}) }
  const errorText = Array.isArray(query.error) ? query.error[0] : query.error

  return <JobEditForm job={job} refs={refs} pricing={pricing} view="worker" errorText={errorText} cancelHref={`/operator/jobs/${id}`} />
}
