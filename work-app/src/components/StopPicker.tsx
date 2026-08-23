'use client'

import { useMemo, useState } from 'react'
import { filterSites, type SiteOption } from '@/lib/job-stops'

export function StopPicker({
  sites,
  onAdd,
}: {
  sites: SiteOption[]
  onAdd: (selectedSites: SiteOption[]) => void
}) {
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const regions = useMemo(() => {
    const values = new Set<string>()
    for (const site of sites) {
      if (site.city?.trim()) values.add(site.city.trim())
      if (site.county?.trim()) values.add(site.county.trim())
    }
    return [...values].sort((a, b) => a.localeCompare(b, 'et-EE'))
  }, [sites])

  const visible = useMemo(() => filterSites(sites, query, region), [sites, query, region])
  const selected = selectedIds
    .map((id) => sites.find((site) => site.id === id))
    .filter((site): site is SiteOption => Boolean(site))

  function toggle(siteId: string) {
    setSelectedIds((current) => current.includes(siteId)
      ? current.filter((id) => id !== siteId)
      : [...current, siteId])
  }

  function addSelected() {
    if (!selected.length) return
    onAdd(selected)
    setSelectedIds([])
  }

  return <div className="stack">
    <label>Otsi nime, aadressi või linna…
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="nt Pirita, Rummu või Tallinn"
        autoComplete="off"
      />
    </label>

    {regions.length > 1 && <label>Piirkond
      <select value={region} onChange={(event) => setRegion(event.target.value)}>
        <option value="">Kõik</option>
        {regions.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>}

    <div className="stack">
      {visible.map((site) => {
        const checked = selectedIds.includes(site.id)
        return <label key={site.id} className="detail-card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input type="checkbox" checked={checked} onChange={() => toggle(site.id)} />
          <span>
            <strong>{site.name}</strong>
            <small className="muted" style={{ display: 'block' }}>{site.address || 'Aadress puudub'}</small>
          </span>
        </label>
      })}
      {visible.length === 0 && <p className="muted">Sobivaid asukohti ei leitud.</p>}
    </div>

    <div className="detail-card stack">
      <strong>Valitud {selected.length}</strong>
      {selected.length > 0 && <div className="stack">
        {selected.map((site, index) => <div key={site.id}><span>{index + 1}. {site.name}</span><small className="muted" style={{ display: 'block' }}>{site.address}</small></div>)}
      </div>}
      <button type="button" className="button primary wide" disabled={!selected.length} onClick={addSelected}>
        Lisa {selected.length} peatust tööle
      </button>
    </div>
  </div>
}
