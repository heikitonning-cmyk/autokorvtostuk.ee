import { correctStopAction } from '@/app/job-stop-actions'

function tallinnLocal(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Tallinn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`
}

export function StopCorrectionForm({
  jobId,
  stop,
}: {
  jobId: string
  stop: {
    id: string
    actual_start?: string | null
    actual_end?: string | null
    completion_note?: string | null
  }
}) {
  const actualStart = tallinnLocal(stop.actual_start)
  const actualEnd = tallinnLocal(stop.actual_end)
  const completionNote = stop.completion_note ?? ''

  return <details className="stack">
    <summary className="button secondary">Paranda</summary>
    <form action={correctStopAction} className="form-card stack">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="stopId" value={stop.id} />
      <div className="form-grid two">
        <label>Algus<input name="actualStart" type="datetime-local" defaultValue={actualStart} /></label>
        <label>Lõpp<input name="actualEnd" type="datetime-local" defaultValue={actualEnd} /></label>
      </div>
      <label>Kohustuslik märkus<textarea name="completionNote" rows={3} required defaultValue={completionNote} /></label>
      <button type="submit" className="button primary wide">Paranda</button>
    </form>
  </details>
}
