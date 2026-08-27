'use client'

import { useMemo } from 'react'
import type { SiteOption } from '@/lib/job-stops'

type EndpointValue = { siteId: string; address: string }

type EndpointFieldsProps = {
  sites: SiteOption[]
  routeStartSiteId: string
  routeStartAddress: string
  routeEndSiteId: string
  routeEndAddress: string
  onStartChange: (value: EndpointValue) => void
  onEndChange: (value: EndpointValue) => void
}

function mode(siteId: string, address: string) {
  if (siteId) return siteId
  if (address.trim()) return '__manual__'
  return '__base__'
}

function EndpointField({ label, prefix, sites, siteId, address, onChange }: {
  label: string
  prefix: 'routeStart' | 'routeEnd'
  sites: SiteOption[]
  siteId: string
  address: string
  onChange: (value: EndpointValue) => void
}) {
  const selectedMode = mode(siteId, address)
  const selectedSite = useMemo(() => sites.find((site) => site.id === siteId), [sites, siteId])

  function changeMode(value: string) {
    if (value === '__base__') return onChange({ siteId: '', address: '' })
    if (value === '__manual__') return onChange({ siteId: '', address: siteId ? '' : address })
    const site = sites.find((item) => item.id === value)
    onChange({ siteId: value, address: site?.address ?? '' })
  }

  return <div className="stack">
    <label>{label}
      <select name={`${prefix}Choice`} value={selectedMode} onChange={(event) => changeMode(event.target.value)}>
        <option value="__base__">Luige (vaikimisi)</option>
        {sites.filter((site) => site.address?.trim()).map((site) => <option key={site.id} value={site.id}>{site.name} · {site.address}</option>)}
        <option value="__manual__">Muu aadress</option>
      </select>
    </label>
    <input type="hidden" name={`${prefix}SiteId`} value={siteId} />
    {selectedMode === '__manual__' && <label>{label} – muu aadress<input name={`${prefix}Address`} value={address} onChange={(event) => onChange({ siteId: '', address: event.target.value })} placeholder="Tänav, linn" /></label>}
    {selectedMode !== '__manual__' && <input type="hidden" name={`${prefix}Address`} value={selectedSite?.address ?? address} />}
  </div>
}

export function RouteEndpointFields(props: EndpointFieldsProps) {
  return <div className="form-grid two">
    <EndpointField label="Algus" prefix="routeStart" sites={props.sites} siteId={props.routeStartSiteId} address={props.routeStartAddress} onChange={props.onStartChange} />
    <EndpointField label="Lõpp" prefix="routeEnd" sites={props.sites} siteId={props.routeEndSiteId} address={props.routeEndAddress} onChange={props.onEndChange} />
  </div>
}
