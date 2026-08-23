'use client'

import { useState } from 'react'
import { StopPicker } from '@/components/StopPicker'
import { StopOrderEditor, type StopOrderItem } from '@/components/StopOrderEditor'
import type { SiteOption } from '@/lib/job-stops'

export function JobStopsEditor({
  sites,
  stops,
  routeStartAddress = '',
  routeEndAddress = '',
  onAddStops,
  onReorder,
  onRouteEndpointsChange,
}: {
  sites: SiteOption[]
  stops: StopOrderItem[]
  routeStartAddress?: string
  routeEndAddress?: string
  onAddStops: (sites: SiteOption[]) => void
  onReorder: (pendingStopIds: string[]) => void
  onRouteEndpointsChange?: (startAddress: string, endAddress: string) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(stops.length === 0)
  const [startAddress, setStartAddress] = useState(routeStartAddress)
  const [endAddress, setEndAddress] = useState(routeEndAddress)

  function saveEndpoints() {
    onRouteEndpointsChange?.(startAddress.trim(), endAddress.trim())
  }

  return <section className="detail-card stack">
    <div>
      <p className="eyebrow">Marsruut</p>
      <h2>Peatused <span className="count">{stops.length}</span></h2>
    </div>

    <div className="form-grid two">
      <label>Algus
        <input value={startAddress} onChange={(event) => setStartAddress(event.target.value)} placeholder="Luige (vaikimisi)" />
      </label>
      <label>Lõpp
        <input value={endAddress} onChange={(event) => setEndAddress(event.target.value)} placeholder="Luige (vaikimisi)" />
      </label>
    </div>
    {onRouteEndpointsChange && <button type="button" className="button secondary wide" onClick={saveEndpoints}>Salvesta algus ja lõpp</button>}

    {stops.length > 0 && <StopOrderEditor stops={stops} onReorder={onReorder} />}

    <button type="button" className="button secondary wide" onClick={() => setPickerOpen((open) => !open)}>
      {pickerOpen ? 'Sulge asukohtade valik' : '+ Lisa peatus'}
    </button>

    {pickerOpen && <StopPicker
      sites={sites}
      onAdd={(selected) => {
        onAddStops(selected)
        setPickerOpen(false)
      }}
    />}
  </section>
}
