'use client'

export function DeleteJobForm({ action, jobId, jobName, buttonLabel = 'Kustuta töö jäädavalt' }: {
  action: (formData: FormData) => void | Promise<void>
  jobId: string
  jobName: string
  buttonLabel?: string
}) {
  return <form
    action={action}
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
