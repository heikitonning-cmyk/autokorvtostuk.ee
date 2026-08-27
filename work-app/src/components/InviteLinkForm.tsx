'use client'

import { useActionState, useState } from 'react'
import { createWorkerInvite, type InviteState } from '@/app/manager/users/actions'

const initialState: InviteState = {}

export function InviteLinkForm() {
  const [state, action, pending] = useActionState(createWorkerInvite, initialState)
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    if (!state.link) return
    try {
      await navigator.clipboard.writeText(state.link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return <div className="form-card stack">
    <div><h2>Lisa kasutaja</h2><p className="muted">Loo 7 päeva kehtiv ühekordne link ja saada see töömehele.</p></div>
    <form action={action}>
      <button className="button primary wide" type="submit" disabled={pending}>{pending ? 'Loon linki…' : 'Loo kutselink'}</button>
    </form>
    {state.error && <div className="alert danger">{state.error}</div>}
    {state.link && <div className="stack">
      <label>Kutselink<input readOnly value={state.link} onFocus={(event) => event.currentTarget.select()} /></label>
      <button className="button secondary wide" type="button" onClick={copyLink}>{copied ? 'Link kopeeritud' : 'Kopeeri link'}</button>
      <small className="muted">Linki näidatakse ainult praegu. Kui see kaob, loo uus kutse.</small>
    </div>}
  </div>
}
