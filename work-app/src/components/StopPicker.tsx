'use client'

import { useMemo, useState } from 'react'
import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { filterSites, type SiteOption } from '@/lib/job-stops'

export type StopDraft = {
  key: string
  siteId: string | null
  name: string
  address: string
  description: string
}

function SortableDraft({ draft, index, onRemove }: { draft: StopDraft; index: number; onRemove: (key: string) => void }) {
  const sortable = useSortable({ id: draft.key })
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }
  return <div ref={sortable.setNodeRef} style={style} className="detail-card">
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <button type="button" className="button secondary" style={{ width: 'auto', padding: '8px 10px' }} {...sortable.attributes} {...sortable.listeners} aria-label="Muuda järjekorda">↕</button>
      <div style={{ flex: 1 }}><strong>{index + 1}. {draft.name}</strong><small className="muted" style={{ display: 'block' }}>{draft.address}</small></div>
      <button type="button" className="button secondary" style={{ width: 'auto' }} onClick={() => onRemove(draft.key)}>Eemalda</button>
    </div>
  </div>
}

export function StopPicker({ sites, onAdd }: { sites: SiteOption[]; onAdd: (drafts: StopDraft[]) => void }) {
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('')
  const [selected, setSelected] = useState<StopDraft[]>([])
  const [manualOpen, setManualOpen] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualAddress, setManualAddress] = useState('')
  const [manualDescription, setManualDescription] = useState('')
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  const regions = useMemo(() => {
    const values = new Set<string>()
    for (const site of sites) {
      if (site.city?.trim()) values.add(site.city.trim())
      if (site.county?.trim()) values.add(site.county.trim())
    }
    return [...values].sort((a, b) => a.localeCompare(b, 'et-EE'))
  }, [sites])

  const visible = useMemo(() => filterSites(sites, query, region), [sites, query, region])
  const selectedSiteIds = new Set(selected.flatMap((draft) => draft.siteId ? [draft.siteId] : []))

  function toggle(site: SiteOption) {
    setSelected((current) => current.some((draft) => draft.siteId === site.id)
      ? current.filter((draft) => draft.siteId !== site.id)
      : [...current, {
          key: crypto.randomUUID(), siteId: site.id, name: site.name,
          address: site.address ?? '', description: '',
        }])
  }

  function addManual() {
    const address = manualAddress.trim()
    if (!address) return
    setSelected((current) => [...current, {
      key: crypto.randomUUID(),
      siteId: null,
      name: manualName.trim() || address,
      address,
      description: manualDescription.trim(),
    }])
    setManualName('')
    setManualAddress('')
    setManualDescription('')
    setManualOpen(false)
  }

  function remove(key: string) { setSelected((current) => current.filter((draft) => draft.key !== key)) }

  function dragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSelected((current) => {
      const from = current.findIndex((draft) => draft.key === active.id)
      const to = current.findIndex((draft) => draft.key === over.id)
      return from < 0 || to < 0 ? current : arrayMove(current, from, to)
    })
  }

  function addSelected() {
    if (!selected.length) return
    onAdd(selected)
    setSelected([])
  }

  return <div className="stack">
    <label>Otsi nime, aadressi või linna…
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="nt Pirita, Rummu või Tallinn" autoComplete="off" />
    </label>

    {regions.length > 1 && <label>Piirkond<select value={region} onChange={(event) => setRegion(event.target.value)}><option value="">Kõik</option>{regions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}

    <div className="stack">
      {visible.map((site) => <label key={site.id} className="detail-card site-option" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <input type="checkbox" checked={selectedSiteIds.has(site.id)} onChange={() => toggle(site)} disabled={!site.address?.trim()} />
        <span><strong>{site.name}</strong><small className="muted" style={{ display: 'block' }}>{site.address || 'Aadress puudub'}</small></span>
      </label>)}
      {visible.length === 0 && <p className="muted">Sobivaid asukohti ei leitud.</p>}
    </div>

    <button type="button" className="button secondary wide" onClick={() => setManualOpen((open) => !open)}>+ Lisa muu aadress</button>
    {manualOpen && <div className="detail-card stack">
      <label>Nimi<input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="nt Ajutine objekt" /></label>
      <label>Aadress<input value={manualAddress} onChange={(event) => setManualAddress(event.target.value)} placeholder="Tänav, linn" /></label>
      <label>Peatuse töö<textarea value={manualDescription} onChange={(event) => setManualDescription(event.target.value)} rows={2} /></label>
      <button type="button" className="button secondary wide" disabled={!manualAddress.trim()} onClick={addManual}>Lisa valikusse</button>
    </div>}

    <div className="detail-card stack">
      <strong>Valitud {selected.length}</strong>
      {selected.length > 0 && <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
        <SortableContext items={selected.map((draft) => draft.key)} strategy={verticalListSortingStrategy}>
          <div className="stack">{selected.map((draft, index) => <SortableDraft key={draft.key} draft={draft} index={index} onRemove={remove} />)}</div>
        </SortableContext>
      </DndContext>}
      <button type="button" className="button primary wide" disabled={!selected.length} onClick={addSelected}>Lisa {selected.length} peatust tööle</button>
    </div>
  </div>
}
