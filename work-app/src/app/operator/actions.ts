'use server'

import { redirect } from 'next/navigation'
import { requireView } from '@/lib/session'

// Old open tabs may still submit these actions. Assignment is manager-only.
export async function claimJob(_formData:FormData) {
  await requireView('worker')
  redirect(`/operator?error=${encodeURIComponent('Tööle määrab juhi juhataja.')}`)
}
export async function releaseJob(_formData:FormData) {
  await requireView('worker')
  redirect(`/operator?error=${encodeURIComponent('Juhi määrangut muudab juhataja.')}`)
}
