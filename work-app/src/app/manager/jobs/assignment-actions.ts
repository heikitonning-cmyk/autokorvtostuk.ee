'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export async function assignJobOperator(_previous:{error?:string;success?:string},form:FormData):Promise<{error?:string;success?:string}> {
  await requireUser('manager')
  const id=String(form.get('jobId')??'')
  const operator=String(form.get('operatorId')??'')
  const version=String(form.get('version')??'')
  if(!id || !version) return {error:'Värskenda lehte ja proovi uuesti.'}
  const db=await createClient()
  try {
    const {error}=await db.rpc('assign_job_operator',{p_job_id:id,p_operator_id:operator||null,p_expected_updated_at:version})
    if(error) return {error:error.code==='P0001'?'Tööd muudeti vahepeal. Värskenda lehte ja kontrolli määratud juhti.':'Juhi määramine ei õnnestunud. Vali aktiivne kasutaja ja proovi uuesti.'}
  } catch {return {error:'Ühendus katkes. Kontrolli määratud juhti enne uuesti salvestamist.'}}
  for(const path of ['/manager','/manager/calendar','/operator',`/manager/jobs/${id}`,`/operator/jobs/${id}`]) revalidatePath(path)
  return {success:operator?'Juht määratud. Töö on tema tööplaanis.':'Juhi määrang eemaldatud.'}
}
