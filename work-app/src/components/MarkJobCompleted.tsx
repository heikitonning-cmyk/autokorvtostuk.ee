'use client'

import { useActionState, useRef, useState } from 'react'
import { markJobCompleted } from '@/app/job-completion-actions'
import { completionDefaults } from '@/lib/jobs'

export function MarkJobCompleted({ jobId, view }: { jobId: string; view: 'manager' | 'operator' }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [defaults, setDefaults] = useState({ date: '', time: '' })
  const [openedAt, setOpenedAt] = useState(0)
  const [state, action, pending] = useActionState(markJobCompleted, { error: null })

  function openDialog() {
    setDefaults(completionDefaults())
    setOpenedAt(Date.now())
    dialog.current?.showModal()
  }

  return <section className="detail-card stack">
    <div><h2>Märgi töö tehtuks</h2><p className="muted">Vali tegelik lõpetamise aeg, ka varasema kuupäevaga.</p></div>
    <button type="button" className="button finish wide" onClick={openDialog}>Märgi tehtuks</button>
    <dialog ref={dialog} className="completion-dialog" aria-labelledby="completion-title" onCancel={event => { if (pending) event.preventDefault() }}>
      <form action={action} className="stack" key={openedAt}>
        <h2 id="completion-title">Märgi töö tehtuks</h2>
        <p>Millal töö tegelikult lõppes?</p>
        <input type="hidden" name="id" value={jobId} />
        <input type="hidden" name="view" value={view} />
        <div className="form-grid two">
          <label>Lõpetamise kuupäev<input name="completedDate" type="date" required defaultValue={defaults.date} max={defaults.date} readOnly={pending} /></label>
          <label>Lõpetamise kellaaeg<input name="completedTime" type="time" required defaultValue={defaults.time} readOnly={pending} /></label>
        </div>
        <p className="muted">Kuupäev ja kellaaeg Eesti aja järgi.</p>
        {state.error && <div role="alert" className="alert danger">{state.error}</div>}
        <div className="action-grid two">
          <button type="button" className="button secondary" disabled={pending} onClick={() => dialog.current?.close()}>Loobu</button>
          <button type="submit" className="button finish" disabled={pending}>{pending ? 'Salvestan…' : 'Kinnita lõpetamine'}</button>
        </div>
      </form>
    </dialog>
  </section>
}
