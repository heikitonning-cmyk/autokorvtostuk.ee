'use client'

import { useMemo, useState } from 'react'

type CustomerOption = { id: string; name: string }
type SiteOption = {
  id: string
  customer_id: string
  name: string
  address: string | null
  city?: string | null
  county?: string | null
  requires_lift?: boolean | null
  service_notes?: string | null
}

const normal = (value: string | null | undefined) => String(value ?? '').trim().toLocaleLowerCase('et-EE')

export function JobLocationFields({
  customers,
  sites,
  initialCustomerId = '',
  initialSiteId = '',
  initialObjectName = '',
  initialAddress = '',
}: {
  customers: CustomerOption[]
  sites: SiteOption[]
  initialCustomerId?: string
  initialSiteId?: string
  initialObjectName?: string
  initialAddress?: string
}) {
  const inferredSite = initialSiteId
    ? sites.find((site) => site.id === initialSiteId)
    : sites.find((site) => site.customer_id === initialCustomerId && normal(site.name) === normal(initialObjectName))
  const inferredAddress = inferredSite?.address && (
    !initialAddress.trim()
    || normal(initialAddress) === normal(inferredSite.name)
    || normal(initialAddress) === `${normal(inferredSite.name)} neste`
  ) ? inferredSite.address : initialAddress

  const [customerId, setCustomerId] = useState(initialCustomerId)
  const [siteId, setSiteId] = useState(inferredSite?.id ?? initialSiteId)
  const [addingSite, setAddingSite] = useState(false)
  const [objectName, setObjectName] = useState(initialObjectName || inferredSite?.name || '')
  const [address, setAddress] = useState(inferredAddress)

  const customerSites = useMemo(
    () => sites.filter((site) => site.customer_id === customerId),
    [sites, customerId],
  )

  const selectedSite = sites.find((site) => site.id === siteId) ?? null
  const addressChoice = siteId || (address ? '__custom__' : '')

  function changeCustomer(nextCustomerId: string) {
    setCustomerId(nextCustomerId)
    const currentSiteStillMatches = sites.some(
      (site) => site.id === siteId && site.customer_id === nextCustomerId,
    )
    if (!currentSiteStillMatches) setSiteId('')
    setAddingSite(false)
  }

  function changeSite(value: string) {
    if (value === '__new__') {
      setSiteId('')
      setAddingSite(true)
      return
    }

    setAddingSite(false)
    setSiteId(value)
    const site = sites.find((item) => item.id === value)
    if (site) {
      setObjectName(site.name)
      setAddress(site.address ?? '')
    }
  }

  function changeAddressSite(value: string) {
    if (value === '__custom__') {
      setAddingSite(false)
      setSiteId('')
      return
    }
    if (!value) {
      setAddingSite(false)
      setSiteId('')
      setAddress('')
      return
    }
    changeSite(value)
  }

  return <>
    <label>Klient
      <select name="customerId" value={customerId} onChange={(event) => changeCustomer(event.target.value)}>
        <option value="">Klient määramata</option>
        {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
      </select>
    </label>

    {customerId && <label>Asukoht / objekt
      <select name="siteId" value={addingSite ? '__new__' : siteId} onChange={(event) => changeSite(event.target.value)}>
        <option value="">Asukoht määramata</option>
        {customerSites.map((site) => <option key={site.id} value={site.id}>{site.name}{site.address ? ` · ${site.address}` : ''}</option>)}
        <option value="__new__">+ Lisa uus asukoht</option>
      </select>
      {customerSites.length === 0 && !addingSite && <small className="muted">Asukohti pole — lisa uus või kasuta vabateksti.</small>}
      {selectedSite?.requires_lift != null && !addingSite && <small className="muted">Tõstuk: {selectedSite.requires_lift ? 'vajalik' : 'ei ole vajalik'}{selectedSite.service_notes ? ` · ${selectedSite.service_notes}` : ''}</small>}
    </label>}

    {customerId && addingSite && <div className="form-grid two">
      <label>Uue asukoha nimi<input name="newSiteName" placeholder="nt Pirita" /></label>
      <label>Uue asukoha aadress<input name="newSiteAddress" placeholder="Tänav, linn" /></label>
    </div>}

    <label>Objekt / lühinimi
      <input name="objectName" value={objectName} onChange={(event) => setObjectName(event.target.value)} placeholder="nt Koivu 12" />
    </label>

    {customerId && customerSites.some((site) => site.address) && !addingSite ? <label>Aadress
      <select name="addressSiteId" value={addressChoice} onChange={(event) => changeAddressSite(event.target.value)}>
        <option value="">Aadress määramata</option>
        {customerSites.filter((site) => site.address).map((site) => <option key={site.id} value={site.id}>{site.address} · {site.name}</option>)}
        <option value="__custom__">Muu aadress</option>
      </select>
    </label> : null}

    {(!customerId || addingSite || addressChoice === '__custom__' || !customerSites.some((site) => site.address))
      ? <label>Aadress
          <input name="address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Tänav, linn" />
        </label>
      : <input type="hidden" name="address" value={address} />}
  </>
}
