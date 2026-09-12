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

export async function createCustomerSite(formData: FormData) {
  await requireUser('manager')
  const customerId = String(formData.get('customerId') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const address = String(formData.get('address') ?? '').trim() || null
  if (!customerId || !name) return

  const supabase = await createClient()
  await supabase.from('customer_sites').insert({
    customer_id: customerId,
    name,
    address,
    requires_lift: formData.get('requiresLift') === 'on' ? true : null,
    source: 'manual',
    active: true,
  })

  revalidatePath('/manager/customers')
  revalidatePath('/manager/jobs/new')
  revalidatePath('/manager')
  revalidatePath('/operator')
}
