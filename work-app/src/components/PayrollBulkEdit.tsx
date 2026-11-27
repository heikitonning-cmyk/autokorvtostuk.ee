'use client'

import { startTransition, useActionState, useState } from 'react'
import { bulkEditTimeEntries } from '@/app/manager/time/actions'
import { parseBulkPatch, previewBulkEntry } from '@/lib/payroll-bulk'
import { clock, euros, hours, type ActionState, type Employee, type TimeEntry } from '@/lib/payroll'
import type { PayrollHistory } from '@/lib/payroll-history'

export function PayrollBulkEdit({ entries, employees, history, onCancel }: { entries: TimeEntry[]; employees: Employee[]; history: PayrollHistory; onCancel: () => void }) {
  // Keep the selected versions fixed while this draft is open.
  const [draft] = useState(entries)
  const [state, action, pending] = useActionState(bulkEditTimeEntries, {} as ActionState)
  const [changeStart, setChangeStart] = useState(false), [changeEnd, setChangeEnd] = useState(false), [changeBreak, setChangeBreak] = useState(false)
  const [start, setStart] = useState(clock(draft[0].start_minute)), [end, setEnd] = useState(clock(draft[0].end_minute!))
  const [nextDay, setNextDay] = useState(draft[0].next_day), [lunch, setLunch] = useState(String(draft[0].break_minutes))
  const name = (entry: TimeEntry) => employees.find(e => e.id === entry.employee_id)?.name ?? 'Tööline'
  const fields = new FormData()
  if (changeStart) fields.set('changeStart', 'on')
  if (changeEnd) fields.set('changeEnd', 'on')
  if (changeBreak) fields.set('changeBreak', 'on')
  if (nextDay) fields.set('nextDay', 'on')
  fields.set('start', start); fields.set('end', end); fields.set('lunch', lunch)
  let error = '', previews: ReturnType<typeof previewBulkEntry>[] = []
  try {
    const patch = parseBulkPatch(fields)
    previews = draft.map(e => {
      try { return previewBulkEntry(e, patch) } catch (err) { throw new Error(`${name(e)}, ${e.work_date.split('-').reverse().join('.')}: ${(err as Error).message}`) }
    })
  } catch (err) { error = (err as Error).message }
  return <form action={action} className="form-card stack" onSubmit={event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    startTransition(() => action(data))
  }}>
    <h2>Muuda valitud tööaegu ({draft.length})</h2>
    <p className="muted">Märgi, mida soovid kõigil valitud kirjetel muuta. Kuupäevad, objektid, märkused ja iga inimese tunnihind säilivad.</p>
    <input type="hidden" name="entries" value={JSON.stringify(draft.map(e => ({ id: e.id, updated_at: e.updated_at })))}/>
    <input type="hidden" name="returnMonth" value={history.month}/><input type="hidden" name="returnEmployee" value={history.employeeId}/><input type="hidden" name="returnScope" value={history.allDays ? 'all' : 'month'}/>
    <fieldset disabled={pending} className="payroll-fields stack">
      <label className="check-row"><input type="checkbox" name="changeStart" checked={changeStart} onChange={e => setChangeStart(e.target.checked)}/>Muuda algusaega</label>
      {changeStart && <label>Uus algus<input type="time" name="start" required value={start} onChange={e => setStart(e.target.value)}/></label>}
      <label className="check-row"><input type="checkbox" name="changeEnd" checked={changeEnd} onChange={e => setChangeEnd(e.target.checked)}/>Muuda lõpuaega</label>
      {changeEnd && <><label>Uus lõpp<input type="time" name="end" required value={end} onChange={e => setEnd(e.target.value)}/></label><label className="check-row"><input type="checkbox" name="nextDay" checked={nextDay} onChange={e => setNextDay(e.target.checked)}/>Lõpp järgmisel päeval</label></>}
      <label className="check-row"><input type="checkbox" name="changeBreak" checked={changeBreak} onChange={e => setChangeBreak(e.target.checked)}/>Muuda lõunapausi</label>
      {changeBreak && <label>Uus lõunapaus, min<input type="number" name="lunch" min="0" max="1439" step="1" required value={lunch} onChange={e => setLunch(e.target.value)}/></label>}
      <div className="stack" aria-live="polite">{error && <p className="muted">{error}</p>}{draft.map((e, i) => <div className="payroll-bulk-preview" key={e.id}>
        <strong>{name(e)} · {e.work_date.split('-').reverse().join('.')}</strong>
        <small>Praegu: {clock(e.start_minute)}–{clock(e.end_minute!)}{e.next_day ? ' (+1 päev)' : ''} · paus {e.break_minutes} min · {hours(e.paid_minutes!)} · {euros(e.wage_cents!)}</small>
        {previews[i] && <small>Uus: {clock(previews[i].startMinute)}–{clock(previews[i].endMinute)}{previews[i].nextDay ? ' (+1 päev)' : ''} · paus {previews[i].breakMinutes} min · {hours(previews[i].paidMinutes)} · {euros(previews[i].wageCents)}</small>}
      </div>)}</div>
      <div className="payroll-buttons"><button className="button primary" disabled={pending || !!error}>{pending ? 'Salvestan…' : `Salvesta ${draft.length} tööaega`}</button><button type="button" className="button secondary" onClick={onCancel}>Tagasi valiku juurde</button></div>
    </fieldset>
    {state.error && <p className="alert danger" role="alert">{state.error}</p>}
  </form>
}
