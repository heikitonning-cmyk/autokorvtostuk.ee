'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { applyRouteProposal, proposeRouteOptimization } from '@/app/route-optimization-actions'
import type { RouteOptimizationResult } from '@/lib/routing/types'

type ProposalState = {
  result: RouteOptimizationResult
  stopNames: Record<string, string>
  routeRevision: number
}

const errorCopy: Record<string, string> = {
  'routing-not-configured': 'Marsruudi optimeerimine pole veel seadistatud.',
  'route-endpoint-missing': 'Marsruudi algus- või lõpp-punkt vajab aadressi.',
  'nothing-to-optimize': 'Optimeerimiseks on vaja vähemalt kahte tegemata peatust.',
  'routing-failed': 'Marsruuti ei õnnestunud arvutada. Praegune järjekord jäi muutmata.',
  'stale-route': 'Marsruuti muudeti teises vaates. Värskenda ja proovi uuesti.',
  'use-remaining': 'Töö on juba alanud. Optimeeri ainult ülejäänud marsruut.',
}

function formatDuration(seconds: number) {
  const minutes = Math.max(0, Math.round(seconds / 60))
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return hours ? `${hours} h ${remainder} min` : `${remainder} min`
}

function formatKm(meters: number | null) {
  if (meters == null) return 'km teadmata'
  return `${(meters / 1000).toFixed(meters >= 10_000 ? 0 : 1)} km`
}

export function RouteOptimizationPanel({
  jobId,
  mode,
  routeRevision,
}: {
  jobId: string
  mode: 'all' | 'remaining'
  routeRevision: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [proposal, setProposal] = useState<ProposalState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const optimizeLabel = mode === 'remaining' ? 'Optimeeri ülejäänud marsruut' : 'Optimeeri marsruut'

  function optimize() {
    setError(null)
    setProposal(null)
    startTransition(async () => {
      const response = await proposeRouteOptimization({ jobId, mode })
      if (!response.ok) {
        setError(errorCopy[response.error] ?? errorCopy['routing-failed'])
        return
      }
      setProposal({ result: response.result, stopNames: response.stopNames, routeRevision: response.routeRevision })
    })
  }

  function apply() {
    if (!proposal) return
    setError(null)
    const form = new FormData()
    form.set('jobId', jobId)
    form.set('expectedRevision', String(proposal.routeRevision))
    form.set('orderedStopIdsJson', JSON.stringify(proposal.result.proposal.orderedStopIds))
    startTransition(async () => {
      const response = await applyRouteProposal(form)
      if (!response.ok) {
        setError(errorCopy[response.error] ?? errorCopy['routing-failed'])
        router.refresh()
        return
      }
      setProposal(null)
      router.refresh()
    })
  }

  const savedSeconds = proposal ? proposal.result.current.durationSeconds - proposal.result.proposal.durationSeconds : 0
  const currentDistance = proposal?.result.current.distanceMeters ?? null
  const proposedDistance = proposal?.result.proposal.distanceMeters ?? null
  const savedMeters = currentDistance != null && proposedDistance != null ? currentDistance - proposedDistance : null

  return <section className="detail-card stack">
    <div>
      <p className="eyebrow">Kiireim järjekord</p>
      <h3>{optimizeLabel}</h3>
      <p className="muted">Arvutus muudab järjekorda alles pärast sinu kinnitust. Waze jääb navigeerimiseks.</p>
    </div>

    <button type="button" className="button secondary wide" disabled={isPending} onClick={optimize}>
      {isPending && !proposal ? 'Arvutan…' : optimizeLabel}
    </button>

    {error && <div className="alert danger">{error}</div>}

    {proposal && <div className="stack">
      <div className="form-grid two">
        <div className="note-box"><strong>Praegune</strong><p>{formatKm(proposal.result.current.distanceMeters)} · {formatDuration(proposal.result.current.durationSeconds)}</p></div>
        <div className="note-box"><strong>Soovitus</strong><p>{formatKm(proposal.result.proposal.distanceMeters)} · {formatDuration(proposal.result.proposal.durationSeconds)}</p></div>
      </div>
      <p><strong>{savedSeconds > 0 ? `Ajavõit umbes ${formatDuration(savedSeconds)}` : 'Ajavõitu praeguse järjekorraga võrreldes ei leitud.'}</strong>{savedMeters != null && savedMeters > 0 ? ` · ${(savedMeters / 1000).toFixed(1)} km vähem` : ''}</p>
      <div className="detail-card stack">
        <strong>Soovitatud järjekord</strong>
        {proposal.result.proposal.orderedStopIds.map((stopId, index) => <div key={stopId}>{index + 1}. {proposal.stopNames[stopId] || stopId}</div>)}
      </div>
      <div className="action-grid two">
        <button type="button" className="button primary wide" disabled={isPending} onClick={apply}>Kasuta soovitust</button>
        <button type="button" className="button secondary wide" disabled={isPending} onClick={() => { setProposal(null); setError(null) }}>Jäta praegune järjekord</button>
      </div>
    </div>}
  </section>
}
