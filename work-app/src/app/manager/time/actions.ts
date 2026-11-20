'use server'

import { payrollHistoryParams, payrollHistoryUrl } from '@/lib/payroll-history'
import { parseBulkEntries, parseBulkPatch } from '@/lib/payroll-bulk'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { calculateTime, parseRate, validDate, tallinnDate, type ActionState } from '@/lib/payroll'

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
const uuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
function dbError(error: { code?: string; message?: string }): ActionState {
  if (error.code === 'P0001') return { error: 'Kirjet on vahepeal muudetud või töö juba lõpetatud. Värskenda nimekirja ja proovi uuesti.' }
  if (error.code === 'P0002') return { error: 'Tööaeg peab olema vähemalt 1 minut ja kuni 24 tundi ning lõunapaus tööajast lühem. Vajadusel paranda algus või lõpp nupuga „Muuda”.' }
  if (error.code === '23P01' || error.code === '23505') return { error: 'Sellel töölisel on samal ajal juba töö kirjas. Kontrolli olemasolevaid tunde.' }
  if (error.code === '23514' || error.code === '23503') return { error: 'Kontrolli tööaega ning tööliste ja valitud objektide andmeid.' }
  return { error: 'Salvestamine ei õnnestunud. Sinu sisestus on alles; proovi uuesti.' }
}

export async function bulkEditTimeEntries(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireUser('manager')
  let entries, patch
  try { entries = parseBulkEntries(value(form, 'entries')); patch = parseBulkPatch(form) }
  catch (error) { return { error: (error as Error).message } }
  try {
    const db = await createClient()
    const { error } = await db.rpc('bulk_edit_payroll_entries', {
      p_entries: entries, p_start_minute: patch.startMinute, p_end_minute: patch.endMinute,
      p_next_day: patch.nextDay, p_break_minutes: patch.breakMinutes,
    })
    if (error) return { error: `Ühtegi valitud kirjet ei muudetud. ${dbError(error).error}` }
  } catch { return { error: 'Ühendus katkes. Värskenda nimekirja ja kontrolli enne uut salvestamist, kas muudatus jõudis kohale.' } }
  revalidatePath('/manager/time','layout')
  const history = payrollHistoryParams({ month: value(form, 'returnMonth'), employee: value(form, 'returnEmployee'), scope: value(form, 'returnScope') }, tallinnDate().slice(0, 7))
  redirect(payrollHistoryUrl(history, String(Date.now())))
}

export async function saveTimeEntry(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireUser('manager')
  const id = value(form, 'id')
  const employeeIds = [...new Set(form.getAll('employeeId').map(String))]
  const siteIds = [...new Set(form.getAll('siteId').map(String).filter(Boolean))]
  const mode = value(form, 'mode') === 'start' && !id ? 'start' : 'manual'
  const date = value(form, 'date'), note = value(form, 'note'), version = value(form, 'version')
  if ((id && !uuid(id)) || !employeeIds.length || employeeIds.length > 100 || employeeIds.some(e=>!uuid(e)) || siteIds.length > 100 || siteIds.some(s=>!uuid(s)) || (id && employeeIds.length !== 1)) return { error: 'Vali vähemalt üks tööline (kuni 100 korraga).' }
  if (mode === 'manual' && !validDate(date)) return { error: 'Sisesta korrektne kuupäev (2000–2099).' }
  if (note.length > 1000) return { error: 'Märkus võib olla kuni 1000 tähemärki.' }
  let time
  const nextDay = form.get('nextDay') === 'on'
  try { if (mode === 'manual') time = calculateTime(value(form, 'start'), value(form, 'end'), value(form, 'lunch'), nextDay) }
  catch (e) { return { error: e instanceof Error ? e.message : 'Kontrolli tööaega.' } }
  const supabase = await createClient()
  try {
    // One transaction for the whole crew and its optional site labels.
    const { error } = await supabase.rpc('save_payroll_entries', {
      p_employee_ids: employeeIds, p_site_ids: siteIds, p_work_date: mode === 'manual' ? date : null,
      p_start_minute: time?.startMinute ?? null, p_end_minute: time?.endMinute ?? null,
      p_next_day: nextDay, p_break_minutes: time?.breakMinutes ?? 0, p_note: note,
      p_entry_id: id || null, p_expected_version: version || null, p_mode: mode,
    })
    if (error) return dbError(error)
  } catch { return { error: 'Ühendus katkes. Kontrolli enne uut salvestamist, kas kirje jõudis nimekirja.' } }
  revalidatePath('/manager/time','layout')
  if (mode === 'start') return { success: `Töö alustatud: ${employeeIds.length} töölist.`, savedId: String(Date.now()) }
  if(id && value(form,'returnToEmployee')==='yes') redirect(`/manager/time/workers/${employeeIds[0]}?saved=1`)
  if(id && value(form,'returnView')==='summary') {
    const history=payrollHistoryParams({month:value(form,'returnMonth'),employee:value(form,'returnEmployee'),scope:value(form,'returnScope')},date.slice(0,7))
    redirect(payrollHistoryUrl(history,String(Date.now())))
  }
  redirect(`/manager/time?month=${date.slice(0, 7)}&saved=${Date.now()}`)
}

export async function finishTimeEntries(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireUser('manager')
  let entries: { id: string; updated_at: string }[]
  try {
    entries = JSON.parse(value(form, 'entries'))
    if (!Array.isArray(entries) || !entries.length || entries.length > 100 || entries.some(e=>!e || !uuid(e.id) || typeof e.updated_at !== 'string' || !Number.isFinite(Date.parse(e.updated_at)))) throw new Error()
  } catch { return { error: 'Vali lõpetatavad töölised.' } }
  const lunch = value(form, 'lunch') || '0'
  if (!/^\d{1,4}$/.test(lunch) || Number(lunch) > 1439) return { error: 'Sisesta lõunapaus minutites (0–1439).' }
  try {
    const db = await createClient()
    const { error } = await db.rpc('finish_payroll_entries', { p_entries: entries, p_break_minutes: Number(lunch) })
    if (error) return dbError(error)
  } catch { return { error: 'Ühendus katkes. Värskenda nimekirja ja kontrolli, kas töö sai lõpetatud.' } }
  revalidatePath('/manager/time','layout')
  return { success: `Töö lõpetatud: ${entries.length} töölist. Tunnid ja palk lisati kokkuvõttesse.`, savedId: String(Date.now()) }
}

export async function deleteTimeEntry(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireUser('manager')
  const id = value(form, 'id')
  if (!uuid(id)) return { error: 'Kirjet ei leitud.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('payroll_entries').delete().eq('id', id).eq('updated_at', value(form, 'version')).select('id').maybeSingle()
  if (error) return dbError(error)
  if (!data) return { error: 'Kirjet on vahepeal muudetud. Laadi leht uuesti.' }
  revalidatePath('/manager/time','layout')
  return { success: 'Kirje kustutatud.' }
}

export async function saveEmployee(_previous: ActionState, form: FormData): Promise<ActionState> {
  await requireUser('manager')
  const id = value(form, 'id'), name = value(form, 'name')
  if ((id && !uuid(id)) || !name || name.length > 120) return { error: 'Sisesta töölise nimi (kuni 120 tähemärki).' }
  let rate
  try { rate = parseRate(value(form, 'rate')) } catch (e) { return { error: (e as Error).message } }
  const supabase = await createClient()
  const effective=value(form,'effectiveFrom')
  const applyRate=id && form.get('applyRate')==='on'
  if(applyRate&&(!validDate(effective)||effective>tallinnDate())) return {error:'Vali tänane või varasem kehtivuse alguskuupäev.'}
  let saved:any
  if(id) {
    const {data,error}=await supabase.rpc('save_payroll_employee_rate',{
      p_employee_id:id,p_expected_version:value(form,'version'),p_name:name,p_active:form.get('active')==='on',
      p_rate:rate,p_effective_from:applyRate?effective:null,
    })
    if(error) return error.code==='P0001'?{error:'Töölise andmeid on vahepeal muudetud. Värskenda lehte.'}:error.code==='23514'?{error:error.message}:dbError(error)
    saved=data
  } else {
    const {data,error}=await supabase.from('payroll_employees').insert({name,hourly_rate_cents:rate,active:true}).select('id,updated_at').single()
    if(error) return dbError(error)
    saved=data
  }
  revalidatePath('/manager','layout')
  return {success:!id?'Tööline lisatud.':applyRate?`Tunnihind rakendatud alates ${effective.split('-').reverse().join('.')}. Uuendatud ${saved.changed_entries} tööajakirjet. Maksete ajalugu säilis.`:'Töölise andmed salvestatud.',savedId:saved.id,savedVersion:saved.updated_at,savedRate:saved.hourly_rate_cents}

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
