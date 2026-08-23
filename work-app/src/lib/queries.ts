import { createClient } from '@/lib/supabase/server'
import type { PriceSettings } from '@/lib/domain'

export const defaultPricing: PriceSettings = {
  hourlyRate: 45,
  minimumOrder: 90,
  driveHourlyRate: 45,
  kmRate: 1,
  helperHourlyRate: 35,
}

export async function getPricingSettings(): Promise<PriceSettings> {
  const supabase = await createClient()
  const { data } = await supabase.from('settings').select('value').eq('key', 'pricing').maybeSingle()
  return { ...defaultPricing, ...(data?.value as Partial<PriceSettings> | null ?? {}) }
}

export async function getManagerJobs() {
  const supabase = await createClient()
  const from = new Date(Date.now() - 35 * 86400000).toISOString()
  const to = new Date(Date.now() + 35 * 86400000).toISOString()
  const select = '*, customer:customers(id,name,phone,email), work_type:work_types(id,name), operator:users!jobs_operator_id_fkey(id,name)'
  const [scheduled, unscheduled] = await Promise.all([
    supabase
      .from('jobs')
      .select(select)
      .gte('start_planned', from)
      .lte('start_planned', to)
      .order('start_planned', { ascending: true }),
    supabase
      .from('jobs')
      .select(select)
      .is('start_planned', null)
      .order('created_at', { ascending: false }),
  ])
  if (scheduled.error) throw scheduled.error
  if (unscheduled.error) throw unscheduled.error
  return [...(unscheduled.data ?? []), ...(scheduled.data ?? [])]
}

export async function getReferenceData() {
  const supabase = await createClient()
  const [customers, operators, workTypes, vehicles] = await Promise.all([
    supabase.from('customers').select('id,name,contact_name,phone').order('name'),
    supabase.from('users').select('id,name').eq('role', 'operator').eq('active', true).order('name'),
    supabase.from('work_types').select('id,name').eq('active', true).order('name'),
    supabase.from('vehicles').select('id,name,registration_number').eq('active', true).order('name'),
  ])
  return {
    customers: customers.data ?? [],
    operators: operators.data ?? [],
    workTypes: workTypes.data ?? [],
    vehicles: vehicles.data ?? [],
  }
}

export async function getJobDetail(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('jobs')
    .select('*, customer:customers(*), work_type:work_types(*), operator:users!jobs_operator_id_fkey(id,name,phone,email), vehicle:vehicles(*), job_photos(*), job_events(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  if (data?.job_photos?.length) {
    data.job_photos = await Promise.all(data.job_photos.map(async (photo: any) => {
      const { data: signed } = await supabase.storage.from('job-photos').createSignedUrl(photo.storage_path, 3600)
      return { ...photo, signed_url: signed?.signedUrl ?? null }
    }))
  }
  return data
}

export async function getOperatorTodayJobs(operatorId: string) {
  const supabase = await createClient()
  const now = new Date()
  const from = new Date(now.getTime() - 12 * 3600000).toISOString()
  const to = new Date(now.getTime() + 36 * 3600000).toISOString()
  const { data, error } = await supabase
    .from('jobs')
    .select('*, customer:customers(id,name,phone), work_type:work_types(id,name)')
    .eq('operator_id', operatorId)
    .neq('status', 'tuhistatud')
    .gte('start_planned', from)
    .lte('start_planned', to)
    .order('start_planned', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getOperatorJob(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('jobs')
    .select('*, customer:customers(id,name,phone,email,billing_address), work_type:work_types(id,name), job_photos(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getCustomers() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('customers')
    .select('*, jobs(id,start_planned,status,estimated_total,actual_total)')
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function getWorkTypes() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('work_types').select('*').order('name')
  if (error) throw error
  return data ?? []
}
