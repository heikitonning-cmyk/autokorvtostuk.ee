'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export async function createCustomer(formData: FormData) {
  await requireUser('manager')
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return
  const supabase = await createClient()
  await supabase.from('customers').insert({
    type: String(formData.get('type') ?? 'company'),
    name,
    registry_code: String(formData.get('registryCode') ?? '').trim() || null,
    contact_name: String(formData.get('contactName') ?? '').trim() || null,
    phone: String(formData.get('phone') ?? '').trim() || null,
    email: String(formData.get('email') ?? '').trim() || null,
    billing_address: String(formData.get('billingAddress') ?? '').trim() || null,
    notes: String(formData.get('notes') ?? '').trim() || null,
  })
  revalidatePath('/manager/customers')
  revalidatePath('/manager/jobs/new')
}
