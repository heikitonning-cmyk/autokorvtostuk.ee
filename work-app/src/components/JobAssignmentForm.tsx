'use client'

import { startTransition, useActionState } from 'react'
import { assignJobOperator } from '@/app/manager/jobs/assignment-actions'

export function JobAssignmentForm({job,operators}:{job:{id:string;operator_id:string|null;updated_at:string;operator?:{name:string}|null};operators:{id:string;name:string}[]}) {
  const [state,action,pending]=useActionState(assignJobOperator,{})
  return <section className="detail-card stack"><h2>Määra juht</h2><p className="muted">Praegu määratud: {job.operator?.name || 'Määramata'}</p>
    <form action={action} onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);startTransition(()=>action(data))}} className="stack">
      <input type="hidden" name="jobId" value={job.id}/><input type="hidden" name="version" value={job.updated_at}/>
      <label>Juht / operaator<select key={job.operator_id??'none'} name="operatorId" defaultValue={job.operator_id??''} disabled={pending}>
        <option value="">Määramata</option>
        {job.operator_id && !operators.some(o=>o.id===job.operator_id) && <option value={job.operator_id} disabled>{job.operator?.name || 'Senine juht'} (mitteaktiivne)</option>}
        {operators.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
      </select></label>
      <button className="button primary" disabled={pending}>{pending?'Salvestan…':'Salvesta juht'}</button>
      {state.error&&<p className="alert danger" role="alert">{state.error}</p>}{state.success&&<p className="alert success" role="status">{state.success}</p>}
    </form>
  </section>
}
