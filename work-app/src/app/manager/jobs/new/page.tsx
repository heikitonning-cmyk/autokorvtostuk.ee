import { randomUUID } from 'node:crypto'
import { requireUser } from '@/lib/session'
import { validDate } from '@/lib/payroll'
import { getDispatchReferences } from '@/lib/queries'
import { SimpleJobForm } from '@/components/SimpleJobForm'

export default async function NewJobPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser('manager')
  const [refs, params] = await Promise.all([getDispatchReferences(), searchParams])
  return <div className="page narrow stack-lg">
    <div><p className="eyebrow">Tööplaan</p><h1>Lisa töö</h1><p className="muted">Töö algus ja lõpp täidavad juhi tööaja. Vajadusel märgi varasem väljasõit.</p></div>
    <SimpleJobForm jobId={randomUUID()} {...refs} initialDate={typeof params.date === 'string' && validDate(params.date) ? params.date : ''} />
  </div>
}
