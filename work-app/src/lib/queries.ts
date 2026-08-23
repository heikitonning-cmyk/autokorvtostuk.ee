import { createClient } from '@/lib/supabase/server'
import type { PriceSettings } from '@/lib/domain'

export const defaultPricing: PriceSettings = {
  hourlyRate: 45,
  minimumOrder: 90,
  driveHourlyRate: 45,
  kmRate: 1,
  helperHourlyRate: 35,
}

export const defaultBaseLocation = {
  label: 'Luige',
  address: 'Luige, Estonia',
}

const siteSelect = 'id,customer_id,name,address,city,county,requires_lift,service_notes,source'

async function signJobPhotos(supabase: any, photos: any[]) {
  if (!photos?.length) return photos ?? []
  return Promise.all(photos.map(async (photo: any) => {
    const { data: signed } = await supabase.storage.from('job-photos').createSignedUrl(photo.storage_path, 3600)
    return { ...photo, signed_url: signed?.signedUrl ?? null }
  }))
}

function attachStopPhotos(data: any) {
  if (!data?.job_stops) return data
  data.job_stops = [...data.job_stops]
    .sort((a: any, b: any) => Number(a.sequence_no) - Number(b.sequence_no))
    .map((stop: any) => ({
      ...stop,
      job_photos: (data.job_photos ?? []).filter((photo: any) => photo.job_stop_id === stop.id),
    }))
  return data
}

export async function getPricingSettings(): Promise<PriceSettings> {
  const supabase = await createClient()
  const { data } = await supabase.from('settings').select('value').eq('key', 'pricing').maybeSingle()
  return { ...defaultPricing, ...(data?.value as Partial<PriceSettings> | null ?? {}) }
}

export async function getBaseLocation() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('settings').select('value').eq('key', 'base_location').maybeSingle()
  if (error) throw error
  return { ...defaultBaseLocation, ...((data?.value as Partial<typeof defaultBaseLocation> | null) ?? {}) }
}

export async function getManagerJobs() {
  const supabase = await createClient()
  const from = new Date(Date.now() - 35 * 86400000).toISOString()
  const to = new Date(Date.now() + 35 * 86400000).toISOString()
  const select = '*, customer:customers(id,name,phone,email), site:customer_sites(id,customer_id,name,address,city,county,requires_lift,service_notes), work_type:work_types(id,name), operator:users!jobs_operator_id_fkey(id,name)'
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

export async function getCustomerSites() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('customer_sites')
    .select(siteSelect)
    .eq('active', true)
    .order('customer_id')
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function getReferenceData() {
  const supabase = await createClient()
  const [customers, operators, workTypes, vehicles, sites] = await Promise.all([
    supabase.from('customers').select('id,name,contact_name,phone').order('name'),
    supabase.from('users').select('id,name').eq('role', 'operator').eq('active', true).order('name'),
    supabase.from('work_types').select('id,name').eq('active', true).order('name'),
    supabase.from('vehicles').select('id,name,registration_number').eq('active', true).order('name'),
    supabase.from('customer_sites').select(siteSelect).eq('active', true).order('customer_id').order('name'),
  ])
  return {
    customers: customers.data ?? [],
    operators: operators.data ?? [],
    workTypes: workTypes.data ?? [],
    vehicles: vehicles.data ?? [],
    sites: sites.data ?? [],
  }
}

export async function getEditableReferenceData() {
  const supabase = await createClient()
  const [customers, workTypes, vehicles, sites] = await Promise.all([
    supabase.from('customers').select('id,name,contact_name,phone').order('name'),
    supabase.from('work_types').select('id,name').eq('active', true).order('name'),
    supabase.from('vehicles').select('id,name,registration_number').eq('active', true).order('name'),
    supabase.from('customer_sites').select(siteSelect).eq('active', true).order('customer_id').order('name'),
  ])
  if (customers.error) throw customers.error
  if (workTypes.error) throw workTypes.error
  if (vehicles.error) throw vehicles.error
  if (sites.error) throw sites.error
  return {
    customers: customers.data ?? [],
    workTypes: workTypes.data ?? [],
    vehicles: vehicles.data ?? [],
    sites: sites.data ?? [],
  }
}

export async function getJobStops(jobId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('job_stops')
    .select('*')
    .eq('job_id', jobId)
    .order('sequence_no', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getJobDetail(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('jobs')
    .select('*, customer:customers(*), site:customer_sites(id,customer_id,name,address,city,county,requires_lift,service_notes), work_type:work_types(*), operator:users!jobs_operator_id_fkey(id,name,phone,email), vehicle:vehicles(*), job_photos(*), job_stops(*), job_events(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  if (data) data.job_photos = await signJobPhotos(supabase, data.job_photos ?? [])
  return attachStopPhotos(data)
}

export async function getWorkerJobs(userId: string) {
  const supabase = await createClient()
  const select = '*, customer:customers(id,name,phone,email), site:customer_sites(id,customer_id,name,address,city,county,requires_lift,service_notes), work_type:work_types(id,name), vehicle:vehicles(id,name,registration_number)'
  const [free, mine] = await Promise.all([
    supabase
      .from('jobs')
      .select(select)
      .is('operator_id', null)
      .neq('status', 'tuhistatud')
      .order('planned_date', { ascending: true, nullsFirst: false })
      .order('planned_time', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('jobs')
      .select(select)
      .eq('operator_id', userId)
      .neq('status', 'tuhistatud')
      .order('planned_date', { ascending: true, nullsFirst: false })
      .order('planned_time', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
  ])
  if (free.error) throw free.error
  if (mine.error) throw mine.error
  return { freeJobs: free.data ?? [], mineJobs: mine.data ?? [] }
}

export async function getSharedLiftCalendar() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('shared_lift_calendar')
  if (error) throw error
  return data ?? []
}

export async function getOperatorTodayJobs(operatorId: string) {
  const supabase = await createClient()
  const now = new Date()
  const from = new Date(now.getTime() - 12 * 3600000).toISOString()
  const to = new Date(now.getTime() + 36 * 3600000).toISOString()
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Tallinn', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  const select = '*, customer:customers(id,name,phone), site:customer_sites(id,customer_id,name,address,city,county,requires_lift,service_notes), work_type:work_types(id,name)'
  const [scheduled, dateOnly] = await Promise.all([
    supabase
      .from('jobs')
      .select(select)
      .eq('operator_id', operatorId)
      .neq('status', 'tuhistatud')
      .gte('start_planned', from)
      .lte('start_planned', to)
      .order('start_planned', { ascending: true }),
    supabase
      .from('jobs')
      .select(select)
      .eq('operator_id', operatorId)
      .neq('status', 'tuhistatud')
      .is('start_planned', null)
      .eq('planned_date', today)
      .order('planned_time', { ascending: true, nullsFirst: false }),
  ])
  if (scheduled.error) throw scheduled.error
  if (dateOnly.error) throw dateOnly.error
  return [...(scheduled.data ?? []), ...(dateOnly.data ?? [])]
}

export async function getOperatorJob(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('jobs')
    .select('*, customer:customers(id,name,phone,email,billing_address), site:customer_sites(id,customer_id,name,address,city,county,requires_lift,service_notes), work_type:work_types(id,name), vehicle:vehicles(id,name,registration_number), job_photos(*), job_stops(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  if (data) data.job_photos = await signJobPhotos(supabase, data.job_photos ?? [])
  return attachStopPhotos(data)
}

export async function getCustomers() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('customers')
    .select('*, customer_sites(id,name,address,active,requires_lift,source), jobs(id,start_planned,planned_date,status,estimated_total,actual_total)')
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
