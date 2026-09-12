export type SiteChoiceInput = {
  siteId?: string | null
  newSiteName?: string | null
  newSiteAddress?: string | null
}

export type NormalizedSiteChoice = {
  siteId: string | null
  newSite: { name: string; address: string | null } | null
}

function clean(value: string | null | undefined) {
  const text = String(value ?? '').trim()
  return text || null
}

export function normalizeSiteChoice(input: SiteChoiceInput): NormalizedSiteChoice {
  const rawSiteId = clean(input.siteId)
  const siteId = rawSiteId && rawSiteId !== '__new__' ? rawSiteId : null
  if (siteId) return { siteId, newSite: null }

  const name = clean(input.newSiteName)
  if (!name) return { siteId: null, newSite: null }

  return {
    siteId: null,
    newSite: {
      name,
      address: clean(input.newSiteAddress),
    },
  }
}
