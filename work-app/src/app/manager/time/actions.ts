'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { calculateTime, parseRate, validDate, type ActionState } from '@/lib/payroll'

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
const uuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
function dbError(error: { code?: string }): ActionState {
  if (error.code === '23P01' || error.code === '23505') return { error: 'Sellel töölisel on samal ajal juba töö kirjas. Kontrolli olemasolevaid tunde.' }
  if (error.code === '23514' || error.code === '23503') return { error: 'Kontrolli tööaega ning vali aktiivne tööline ja objekt.' }
  return { error: 'Salvestamine ei õnnestunud. Sinu sisestus on alles; proovi uuesti.' }
}

export async function saveTimeEntry(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireUser('manager')
  const id = value(form, 'id'), employeeId = value(form, 'employeeId'), siteId = value(form, 'siteId')
  const date = value(form, 'date'), note = value(form, 'note'), version = value(form, 'version')
  if ((id && !uuid(id)) || !uuid(employeeId) || !uuid(siteId)) return { error: 'Vali tööline ja objekt.' }
  if (!validDate(date)) return { error: 'Sisesta korrektne kuupäev (2000–2099).' }
  if (note.length > 1000) return { error: 'Märkus võib olla kuni 1000 tähemärki.' }
  let time
  const nextDay = form.get('nextDay') === 'on'
  try { time = calculateTime(value(form, 'start'), value(form, 'end'), value(form, 'lunch'), nextDay) }
  catch (e) { return { error: e instanceof Error ? e.message : 'Kontrolli tööaega.' } }
  const supabase = await createClient()
  const record = { employee_id: employeeId, site_id: siteId, work_date: date, start_minute: time.startMinute,
    end_minute: time.endMinute, next_day: nextDay, break_minutes: time.breakMinutes, note }
  try {
    // The database captures the rate and computes wages; never trust browser totals.
    const query = id
      ? supabase.from('payroll_entries').update(record).eq('id', id).eq('updated_at', version)
      : supabase.from('payroll_entries').insert(record)
    const { data, error } = await query.select('id').maybeSingle()
    if (error) return dbError(error)
    if (!data) return { error: 'Kirjet on vahepeal muudetud või kustutatud. Laadi leht uuesti ja kontrolli andmeid.' }
  } catch { return { error: 'Ühendus katkes. Kontrolli enne uut salvestamist, kas kirje jõudis nimekirja.' } }
  revalidatePath('/manager/time')
  redirect(`/manager/time?month=${date.slice(0, 7)}&saved=${Date.now()}`)
}

export async function deleteTimeEntry(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireUser('manager')
  const id = value(form, 'id')
  if (!uuid(id)) return { error: 'Kirjet ei leitud.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('payroll_entries').delete().eq('id', id).eq('updated_at', value(form, 'version')).select('id').maybeSingle()
  if (error) return dbError(error)
  if (!data) return { error: 'Kirjet on vahepeal muudetud. Laadi leht uuesti.' }
  revalidatePath('/manager/time')
  return { success: 'Kirje kustutatud.' }
}

export async function saveEmployee(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireUser('manager')
  const id = value(form, 'id'), name = value(form, 'name')
  if ((id && !uuid(id)) || !name || name.length > 120) return { error: 'Sisesta töölise nimi (kuni 120 tähemärki).' }
  let rate
  try { rate = parseRate(value(form, 'rate')) } catch (e) { return { error: (e as Error).message } }
  const supabase = await createClient()
  const row = { name, hourly_rate_cents: rate, active: id ? form.get('active') === 'on' : true }
  const query = id ? supabase.from('payroll_employees').update(row).eq('id', id).eq('updated_at', value(form, 'version')) : supabase.from('payroll_employees').insert(row)
  const { data, error } = await query.select('id,updated_at').maybeSingle()
  if (error) return dbError(error)
  if (!data) return { error: 'Töölise andmeid on vahepeal muudetud. Laadi leht uuesti ja kontrolli tunnihinda.' }
  revalidatePath('/manager/time')
  return { success: id ? 'Töölise andmed salvestatud. Varasemate kirjete tunnihinnad säilisid.' : 'Tööline lisatud.', savedId: data.id, savedVersion: data.updated_at }
}

export async function addPayrollSite(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireUser('manager')
  const name = value(form, 'name'), customerId = value(form, 'customerId'), address = value(form, 'address')
  if (!uuid(customerId) || !name || name.length > 120 || address.length > 300) return { error: 'Vali klient ja sisesta objekti nimi (kuni 120 tähemärki).' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('customer_sites').insert({ customer_id: customerId, name, address: address || null, source: 'manual', active: true }).select('id').single()
  if (error) return dbError(error)
  for (const path of ['/manager/time','/manager/customers','/manager/jobs/new','/manager']) revalidatePath(path)
  return { success: 'Objekt lisatud. Seda saab kasutada ka tööde juures.', savedId: data.id }
}
