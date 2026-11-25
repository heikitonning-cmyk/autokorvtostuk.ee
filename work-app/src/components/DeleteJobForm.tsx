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
      const withSheet=new FormData(event.currentTarget).get('deleteSheet')==='on'
      if (!window.confirm(`Kustutada töö „${jobName}“${withSheet?' koos saatelehe ja allkirjaga':''} jäädavalt? Seda tegevust ei saa tagasi võtta.`)) {
        event.preventDefault()
      }
    }}
  >
    <input type="hidden" name="id" value={jobId} />
    <label className="check-row" style={{marginBottom:12}}><input type="checkbox" name="deleteSheet"/>Kustuta ka selle töö saateleht ja allkiri</label>
    <button type="submit" className="button danger-outline wide">{buttonLabel}</button>
  </form>
}
