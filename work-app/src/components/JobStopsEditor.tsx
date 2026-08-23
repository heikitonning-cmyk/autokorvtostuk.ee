'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { StopPicker, type StopDraft } from '@/components/StopPicker'
import { StopOrderEditor, type StopOrderItem } from '@/components/StopOrderEditor'
import type { SiteOption } from '@/lib/job-stops'
import { addStopsAction, reorderStopsAction, updateRouteEndpointsAction } from '@/app/job-stop-actions'

type DraftStop = StopOrderItem & { siteId: string | null }

const toDraft = (draft: StopDraft, index: number): DraftStop => ({
  id: draft.key,
  siteId: draft.siteId,
  sequence_no: index + 1,
  name_snapshot: draft.name,
  address_snapshot: draft.address,
  description: draft.description || null,
  status: 'pending',
})

export function JobStopsEditor({
  sites,
  stops = [],
  jobId,
  routeRevision = 0,
  routeStartAddress = '',
  routeEndAddress = '',
}: {
  sites: SiteOption[]
  stops?: StopOrderItem[]
  jobId?: string
  routeRevision?: number
  routeStartAddress?: string
  routeEndAddress?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pickerOpen, setPickerOpen] = useState(stops.length === 0)
  const [revision, setRevision] = useState(Number(routeRevision || 0))
  const [draftStops, setDraftStops] = useState<DraftStop[]>([])
  const [startAddress, setStartAddress] = useState(routeStartAddress)
  const [endAddress, setEndAddress] = useState(routeEndAddress)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setRevision(Number(routeRevision || 0)), [routeRevision])
  useEffect(() => setStartAddress(routeStartAddress), [routeStartAddress])
  useEffect(() => setEndAddress(routeEndAddress), [routeEndAddress])

  const shownStops = jobId ? stops : draftStops
  const initialStopsJson = useMemo(() => JSON.stringify(draftStops.map((stop) => ({
    siteId: stop.siteId,
    name: stop.name_snapshot ?? '',
    address: stop.address_snapshot,
    description: stop.description ?? '',
  }))), [draftStops])

  function addSelected(selected: StopDraft[]) {
    setError(null)
    if (!jobId) {
      setDraftStops((current) => [
        ...current,
        ...selected.map((draft, index) => toDraft(draft, current.length + index)),
      ])
      setPickerOpen(false)
      return
    }

    const form = new FormData()
    form.set('jobId', jobId)
    form.set('expectedRevision', String(revision))
    form.set('stopsJson', JSON.stringify(selected.map((draft) => ({
      siteId: draft.siteId,
      name: draft.name,
      address: draft.address,
      description: draft.description,
    }))))
    startTransition(async () => {
      const result = await addStopsAction(form)
      if (!result.ok) {
        setError(result.error === 'stale-route' ? 'Marsruuti muudeti teises vaates. Värskenda ja proovi uuesti.' : 'Peatuste lisamine ei õnnestunud.')
        router.refresh()
        return
      }
      setRevision(result.revision ?? revision)
      setPickerOpen(false)
      router.refresh()
    })
  }

  function reorder(pendingStopIds: string[]) {
    setError(null)
    if (!jobId) {
      setDraftStops((current) => {
        const byId = new Map(current.map((stop) => [stop.id, stop]))
        return pendingStopIds
          .map((id, index) => {
            const stop = byId.get(id)
            return stop ? { ...stop, sequence_no: index + 1 } : null
          })
          .filter((stop): stop is DraftStop => Boolean(stop))
      })
      return
    }

    const form = new FormData()
    form.set('jobId', jobId)
    form.set('expectedRevision', String(revision))
    form.set('stopIdsJson', JSON.stringify(pendingStopIds))
    startTransition(async () => {
      const result = await reorderStopsAction(form)
      if (!result.ok) {
        setError(result.error === 'stale-route' ? 'Marsruuti muudeti teises vaates. Värskenda ja proovi uuesti.' : 'Järjekorra muutmine ei õnnestunud.')
        router.refresh()
        return
      }
      setRevision(result.revision ?? revision)
      router.refresh()
    })
  }

  function saveEndpoints() {
    if (!jobId) return
    setError(null)
    const form = new FormData()
    form.set('jobId', jobId)
    form.set('expectedRevision', String(revision))
    form.set('routeStartAddress', startAddress)
    form.set('routeEndAddress', endAddress)
    startTransition(async () => {
      const result = await updateRouteEndpointsAction(form)
      if (!result.ok) {
        setError(result.error === 'stale-route' ? 'Marsruuti muudeti teises vaates. Värskenda ja proovi uuesti.' : 'Algus- ja lõpp-punkti salvestamine ei õnnestunud.')
        router.refresh()
        return
      }
      setRevision(result.revision ?? revision)
      router.refresh()
    })
  }

  return <section className="detail-card stack">
    {!jobId && <input type="hidden" name="initialStopsJson" value={initialStopsJson} />}
    <div><p className="eyebrow">Marsruut</p><h2>Peatused <span className="count">{shownStops.length}</span></h2></div>
    {error && <div className="alert danger">{error}</div>}

    <div className="form-grid two">
      <label>Algus<input value={startAddress} onChange={(event) => setStartAddress(event.target.value)} placeholder="Luige (vaikimisi)" /></label>
      <label>Lõpp<input value={endAddress} onChange={(event) => setEndAddress(event.target.value)} placeholder="Luige (vaikimisi)" /></label>
    </div>
    {jobId && <button type="button" className="button secondary wide" disabled={isPending} onClick={saveEndpoints}>Salvesta algus ja lõpp</button>}

    {shownStops.length > 0 && <StopOrderEditor stops={shownStops} onReorder={reorder} />}

    <button type="button" className="button secondary wide" disabled={isPending} onClick={() => setPickerOpen((open) => !open)}>{pickerOpen ? 'Sulge asukohtade valik' : '+ Lisa peatus'}</button>
    {pickerOpen && <StopPicker sites={sites} onAdd={addSelected} />}
    {isPending && <small className="muted">Salvestan marsruuti…</small>}
  </section>
}
