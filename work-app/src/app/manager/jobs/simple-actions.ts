'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { calculateTime, validDate } from '@/lib/payroll'
import { plannedEndError, timeMinute } from '@/lib/simple-dispatch'

export async function saveSimpleJob(_previous: { error: string }, form: FormData): Promise<{ error: string }> {
  await requireUser('manager')
  const value = (key: string) => String(form.get(key) ?? '').trim()
  const scheduleError = plannedEndError(value('date'), value('time'), value('endTime'))
  if (scheduleError) return { error: scheduleError }
  const driver = value('driver')
  const payroll = driver ? {
    work_date: value('workDate'), start_minute: timeMinute(value('departure')),
    end_minute: timeMinute(value('finish')), next_day: form.get('nextDay') === 'on',
    break_minutes: /^\d+$/.test(value('pause')) ? Number(value('pause')) : null,
  } : null
  if (payroll && (!payroll.work_date || payroll.start_minute == null || payroll.end_minute == null || payroll.break_minutes == null)) {
    return { error: 'Juhi tööaja jaoks täida kuupäev, väljasõit, lõpetamine ja paus.' }
  }
  if (value('date') && !validDate(value('date'))) return { error: 'Vali korrektne töö kuupäev.' }
  if (payroll) {
    if (!validDate(payroll.work_date)) return { error: 'Vali korrektne tööaja kuupäev.' }
    try { calculateTime(value('departure'), value('finish'), value('pause'), payroll.next_day) }
    catch (error) { return { error: error instanceof Error ? error.message : 'Kontrolli juhi tööaega.' } }
  }
  const db = await createClient()
  const { data, error } = await db.rpc('save_simple_job', {
    p_job_id: value('jobId'), p_expected_updated_at: value('version') || null,
    p_job: { address: value('address'), planned_date: value('date'), planned_time: value('time'), planned_end_time: value('endTime'),
      contact_phone: value('phone'), description: value('description'),
      driver_employee_id: driver, site_id: value('siteId'), customer_id: value('customerId') },
    p_payroll: payroll, p_expected_entry_updated_at: value('entryVersion') || null,
  })
  if (error) {
    if (error.code === '23P01') return { error: 'Juhi tööaeg kattub palgaarvestuses juba oleva ajaga. Muuda olemasolevat kirjet ja proovi uuesti.' }
    if (error.code === '23505') return { error: 'Töö on juba salvestatud. Ava tööde nimekiri.' }
    return { error: error.message || 'Salvestamine ebaõnnestus. Proovi uuesti.' }
  }
  for (const path of ['/manager', '/manager/calendar', '/manager/time', '/operator', `/manager/jobs/${data}`]) revalidatePath(path)
  redirect(`/manager/jobs/${data}?saved=1`)
}
