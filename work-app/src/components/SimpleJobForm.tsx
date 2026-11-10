'use client'

import Link from 'next/link'
import { startTransition, useActionState, useState } from 'react'
import { saveSimpleJob } from '@/app/manager/jobs/simple-actions'
import { driverTimePreview, minuteTime, visibleDispatchSites, type DispatchEmployee, type DispatchSite } from '@/lib/simple-dispatch'

export function SimpleJobForm({ jobId, job, employees, sites, entry, initialDate = '' }: {
  jobId: string; job?: any; employees: DispatchEmployee[]; sites: DispatchSite[]; entry?: any; initialDate?: string
}) {
  const [state, action, pending] = useActionState(saveSimpleJob, { error: '' })
  const [address, setAddress] = useState(job?.address ?? '')
  const [siteId, setSiteId] = useState(job?.site_id ?? '')
  const [customerId, setCustomerId] = useState(job?.customer_id ?? '')
  const [showNeste, setShowNeste] = useState(false)
  const [search, setSearch] = useState('')
  const [driver, setDriver] = useState(job?.driver_employee_id ?? '')
  const [date, setDate] = useState(job?.planned_date ?? initialDate)
  const [plannedTime, setPlannedTime] = useState(job?.planned_time?.slice(0, 5) ?? '')
  const [plannedEndTime, setPlannedEndTime] = useState(job?.planned_end_time?.slice(0, 5) ?? '')
  const [phone, setPhone] = useState(job?.contact_phone ?? job?.website_booking_details?.phone ?? job?.customer?.phone ?? '')
  const [description, setDescription] = useState(job?.description ?? '')
  const [workDate, setWorkDate] = useState<string | null>(entry?.work_date && entry.work_date !== job?.planned_date ? entry.work_date : null)
  const [departureOverride, setDeparture] = useState<string | null>(entry && minuteTime(entry.start_minute) !== job?.planned_time?.slice(0, 5) ? minuteTime(entry.start_minute) : null)
  const [finishOverride, setFinish] = useState<string | null>(entry && minuteTime(entry.end_minute) !== job?.planned_end_time?.slice(0, 5) ? minuteTime(entry.end_minute) : null)
  const [pause, setPause] = useState(String(entry?.break_minutes ?? 0))
  const [nextDay, setNextDay] = useState(Boolean(entry?.next_day))
  const [showTimeOptions, setShowTimeOptions] = useState(Boolean(workDate || Number(pause) || nextDay))
  const departure = departureOverride ?? plannedTime
  const finish = finishOverride ?? plannedEndTime
  const employee = employees.find(e => e.id === driver)
  const rate = entry?.employee_id === driver ? entry.hourly_rate_cents : employee?.hourly_rate_cents ?? 0
  const preview = driverTimePreview(departure, finish, nextDay, pause, rate)
  const choices = visibleDispatchSites(sites, showNeste, search)
  const cancelHref = job ? `/manager/jobs/${jobId}` : '/manager'

  return <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); startTransition(() => action(form)) }} className="form-card stack simple-job-form">
    <input type="hidden" name="jobId" value={jobId} />
    <input type="hidden" name="version" value={job?.updated_at ?? ''} />
    <input type="hidden" name="entryVersion" value={entry?.updated_at ?? ''} />
    <input type="hidden" name="siteId" value={siteId} />
    <input type="hidden" name="customerId" value={customerId} />
    {state.error && <div role="alert" className="alert danger">{state.error}</div>}
    <fieldset disabled={pending} className="simple-job-fields stack">
      <label>Aadress<input name="address" value={address} maxLength={500} placeholder="Tänav, maja ja asula" onChange={e => { setAddress(e.target.value); setSiteId('') }} /></label>
      <details className="simple-address-picker"><summary>Vali salvestatud aadress</summary>
        <div className="stack top-gap">
          <label className="simple-check"><input type="checkbox" checked={showNeste} onChange={e => setShowNeste(e.target.checked)} />Näita ka Neste aadresse</label>
          <label>Otsi aadressi<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Objekt või aadress" /></label>
          <label>Salvestatud aadress<select value={choices.some(s => s.id === siteId) ? siteId : ''} onChange={e => { const site = sites.find(s => s.id === e.target.value); if (site) { setSiteId(site.id); setCustomerId(site.customer_id); setAddress(site.address) } }}>
            <option value="">Vali aadress</option>{choices.map(site => <option key={site.id} value={site.id}>{site.name} · {site.address}</option>)}
          </select></label>
          {choices.length === 0 && <small className="muted">Sobivaid aadresse pole. Neste aadressid saad avada ülal oleva filtriga.</small>}
        </div>
      </details>
      <label>Kuupäev<input name="date" type="date" min="2000-01-01" max="2099-12-31" required={!!driver && !workDate} value={date} onInput={e => setDate(e.currentTarget.value)} onChange={e => setDate(e.target.value)} /></label>
      <section className="simple-time-row" aria-labelledby="customer-time-heading">
        <strong id="customer-time-heading">Tööaeg tellijale</strong>
        <div className="simple-job-times">
          <label>Algus<input aria-label="Tellija töö algus" name="time" type="time" value={plannedTime} onInput={e => setPlannedTime(e.currentTarget.value)} onChange={e => setPlannedTime(e.target.value)} /></label>
          <label>Lõpp<input aria-label="Tellija töö lõpp" name="endTime" type="time" value={plannedEndTime} onInput={e => setPlannedEndTime(e.currentTarget.value)} onChange={e => setPlannedEndTime(e.target.value)} /></label>
        </div>
      </section>
      <label>Juht<select name="driver" value={driver} onChange={e => setDriver(e.target.value)}>
        {!entry && <option value="">Määran hiljem</option>}{employees.filter(e => e.active || e.id === driver).map(e => <option key={e.id} value={e.id}>{e.name}{!e.active ? ' (arhiveeritud)' : ''}</option>)}
      </select></label>
      {employees.every(e => !e.active) && <small className="muted">Lisa töötaja <Link href="/manager/time">palgaarvestusse</Link>, et teda juhiks valida.</small>}
      {driver ? <section className="simple-time-row simple-driver-time" aria-labelledby="driver-time-heading">
        <strong id="driver-time-heading">Juhi tööaeg</strong>
        <div className="simple-job-times">
          <label>Algus / väljasõit<input aria-label="Juhi algus / väljasõit" name="departure" type="time" required value={departure} onInput={e => setDeparture(e.currentTarget.value)} onChange={e => setDeparture(e.target.value)} /></label>
          <label>Lõpp<input aria-label="Juhi lõpp" name="finish" type="time" required value={finish} onInput={e => setFinish(e.currentTarget.value)} onChange={e => setFinish(e.target.value)} /></label>
        </div>
        <small className="muted">Juhi aeg läheb palgaarvestusse. Muuda ainult erinevused.</small>
        {preview && <strong className="simple-wage-preview" aria-live="polite">Palgaarvestusse: {(preview.minutes / 60).toLocaleString('et-EE', { maximumFractionDigits: 2 })} tundi · {(preview.cents / 100).toLocaleString('et-EE', { style: 'currency', currency: 'EUR' })}</strong>}
        <details className="simple-time-options" open={showTimeOptions} onToggle={e => setShowTimeOptions(e.currentTarget.open)}>
          <summary>Lisavalikud{[workDate ? `kuupäev ${workDate.split('-').reverse().join('.')}` : '', Number(pause) ? `paus ${pause} min` : '', nextDay ? 'lõpp järgmisel päeval' : ''].filter(Boolean).map(text => ` · ${text}`)}</summary>
          <div className="stack top-gap">
            <label>Juhi kuupäev (kui erineb)<input name="workDate" type="date" min="2000-01-01" max="2099-12-31" value={workDate ?? ''} onInput={e => setWorkDate(e.currentTarget.value || null)} onChange={e => setWorkDate(e.target.value || null)} /><small className="muted">Tühjaks jättes kasutatakse töö kuupäeva.</small></label>
            <div className="simple-job-times">
              <label>Paus minutites<input name="pause" type="number" min="0" max="1439" required value={pause} onChange={e => setPause(e.target.value)} /></label>
              <label className="simple-check"><input name="nextDay" type="checkbox" checked={nextDay} onChange={e => setNextDay(e.target.checked)} />Lõpp järgmisel päeval</label>
            </div>
          </div>
        </details>
      </section> : <small className="muted">Juhi valimisel lisatakse tema tööaeg palgaarvestusse.</small>}
      <label>Tellija telefon<input name="phone" type="tel" maxLength={50} placeholder="+372 …" value={phone} onChange={e => setPhone(e.target.value)} /></label>
      <label>Töö kirjeldus<textarea name="description" rows={2} maxLength={2000} placeholder="Mida tuleb teha?" value={description} onChange={e => setDescription(e.target.value)} /></label>
      <div className="action-grid two"><Link href={cancelHref} className="button secondary">Tagasi</Link><button type="submit" className="button primary" disabled={pending}>{pending ? 'Salvestan…' : 'Salvesta töö'}</button></div>
    </fieldset>
  </form>
}
