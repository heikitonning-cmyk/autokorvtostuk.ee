'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export function PhotoUploader({ jobId, jobStopId }: { jobId: string; jobStopId?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'idle' | 'uploading' | 'ok' | 'error'>('idle')
  const router = useRouter()

  async function upload(file?: File) {
    if (!file) return
    setState('uploading')
    const body = new FormData()
    body.set('file', file)
    body.set('category', 'during')
    if (jobStopId) body.set('jobStopId', jobStopId)
    try {
      const res = await fetch(`/api/jobs/${jobId}/photos`, { method: 'POST', body })
      if (!res.ok) throw new Error('upload failed')
      setState('ok')
      router.refresh()
    } catch {
      setState('error')
    }
  }

  return <div className="upload-box">
    <input ref={input} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(e) => upload(e.target.files?.[0])} />
    <button type="button" className="button secondary wide" onClick={() => input.current?.click()} disabled={state === 'uploading'}>{state === 'uploading' ? 'Laen fotot…' : '+ Lisa foto'}</button>
    {state === 'ok' && <small className="success-text">Foto salvestatud.</small>}
    {state === 'error' && <small className="error-text">Foto ei salvestunud. Proovi uuesti, kui ühendus taastub.</small>}
  </div>
}
