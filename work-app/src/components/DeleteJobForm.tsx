'use client'

import { deleteJob } from '@/app/manager/jobs/actions'

export function DeleteJobForm({ jobId, jobName, buttonLabel = 'Kustuta töö jäädavalt' }: {
  jobId: string
  jobName: string
  buttonLabel?: string
}) {
  return <form
    action={deleteJob}
    onSubmit={(event) => {
      if (!window.confirm(`Kustutada töö „${jobName}“ jäädavalt? Seda tegevust ei saa tagasi võtta.`)) {
        event.preventDefault()
      }
    }}
  >
    <input type="hidden" name="id" value={jobId} />
    <button type="submit" className="button danger-outline wide">{buttonLabel}</button>
  </form>
}
