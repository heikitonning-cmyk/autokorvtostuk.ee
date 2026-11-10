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
  const [phone, setPhone] = useState(job?.contact_phone ?? job?.website_booking_details?.phone ?? job?.customer?.phone ?? '')
  const [description, setDescription] = useState(job?.description ?? '')
  const [workDate, setWorkDate] = useState<string | null>(entry?.work_date ?? null)
  const [departure, setDeparture] = useState(minuteTime(entry?.start_minute))
  const [finish, setFinish] = useState(minuteTime(entry?.end_minute))
  const [pause, setPause] = useState(String(entry?.break_minutes ?? 0))
  const [nextDay, setNextDay] = useState(Boolean(entry?.next_day))
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
      <div className="form-grid two">
        <label>Kuupäev<input name="date" type="date" min="2000-01-01" max="2099-12-31" value={date} onInput={e => setDate(e.currentTarget.value)} onChange={e => setDate(e.target.value)} /></label>
        <label>Töö kellaaeg<input name="time" type="time" value={plannedTime} onInput={e => setPlannedTime(e.currentTarget.value)} onChange={e => setPlannedTime(e.target.value)} /></label>
      </div>
      <label>Tellija telefon<input name="phone" type="tel" maxLength={50} placeholder="+372 …" value={phone} onChange={e => setPhone(e.target.value)} /></label>
      <label>Juht<select name="driver" value={driver} onChange={e => setDriver(e.target.value)}>
        {!entry && <option value="">Määran hiljem</option>}{employees.filter(e => e.active || e.id === driver).map(e => <option key={e.id} value={e.id}>{e.name}{!e.active ? ' (arhiveeritud)' : ''}</option>)}
      </select></label>
      {employees.every(e => !e.active) && <small className="muted">Lisa töötaja <Link href="/manager/time">palgaarvestusse</Link>, et teda juhiks valida.</small>}
      <label>Töö kirjeldus<textarea name="description" rows={2} maxLength={2000} placeholder="Mida tuleb teha?" value={description} onChange={e => setDescription(e.target.value)} /></label>
      {driver && <section className="simple-time-panel stack" aria-labelledby="driver-time-heading">
        <strong id="driver-time-heading">Juhi tööaeg</strong>
        <p className="muted">Tasustatud aeg algab väljasõidust. Salvestamisel kantakse tunnid palgaarvestusse.</p>
        <label>Tööaja kuupäev<input name="workDate" type="date" min="2000-01-01" max="2099-12-31" required value={workDate ?? date} onInput={e => setWorkDate(e.currentTarget.value)} onChange={e => setWorkDate(e.target.value)} /></label>
        <div className="form-grid two">
          <label>Väljasõit<input name="departure" type="time" required value={departure} onInput={e => setDeparture(e.currentTarget.value)} onChange={e => setDeparture(e.target.value)} /></label>
          <label>Lõpetamine<input name="finish" type="time" required value={finish} onInput={e => setFinish(e.currentTarget.value)} onChange={e => setFinish(e.target.value)} /></label>
        </div>
        <div className="form-grid two">
          <label>Paus minutites<input name="pause" type="number" min="0" max="1439" required value={pause} onChange={e => setPause(e.target.value)} /></label>
          <label className="simple-check"><input name="nextDay" type="checkbox" checked={nextDay} onChange={e => setNextDay(e.target.checked)} />Lõpp järgmisel päeval</label>
        </div>
        {preview && <div className="alert success">{(preview.minutes / 60).toLocaleString('et-EE', { maximumFractionDigits: 2 })} tundi · {(preview.cents / 100).toLocaleString('et-EE', { style: 'currency', currency: 'EUR' })}</div>}
      </section>}
      <div className="action-grid two"><Link href={cancelHref} className="button secondary">Tagasi</Link><button type="submit" className="button primary" disabled={pending}>{pending ? 'Salvestan…' : 'Salvesta töö'}</button></div>
    </fieldset>
  </form>
}
