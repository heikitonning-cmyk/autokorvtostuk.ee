const money = (value: number) => new Intl.NumberFormat('et-EE', { style: 'currency', currency: 'EUR' }).format(value)

export function OperatorWorkSummary({ job }: { job: any }) {
  return <section className="detail-card">
    <h2>Operaator teostab töö: {job.operator_does_work ? 'Jah' : 'Ei'}</h2>
    {job.operator_does_work && <p>Operaatori teostatav töö: <strong>+{money(Number(job.operator_work_surcharge ?? 0))}</strong> · {job.estimated_hours ?? 0} töötundi objektil.</p>}
    {job.actual_operator_work_hours != null && <p>Tegelik operaatori töö: <strong>{job.actual_operator_work_hours} h · +{money(Number(job.actual_operator_work_surcharge ?? 0))}</strong></p>}
    {job.operator_does_work && <p className="muted">Lisatasu on koguhinnas. Sõiduajale ega kilometraažile seda ei lisata.</p>}
  </section>
}
