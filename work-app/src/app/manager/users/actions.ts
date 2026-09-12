'use server'

import { randomBytes } from 'node:crypto'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { hashInviteToken } from '@/lib/invites'

export type InviteState = { link?: string; error?: string }

export async function createWorkerInvite(_previous: InviteState, _formData: FormData): Promise<InviteState> {
  const user = await requireUser('manager')
  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashInviteToken(token)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const supabase = await createClient()
  const { error } = await supabase.from('user_invites').insert({
    token_hash: tokenHash,
    role: 'operator',
    created_by: user.id,
    expires_at: expiresAt,
  })
  if (error) return { error: error.message }

  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host')
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'https'
  if (!host) return { error: 'Kutselink loodi, kuid rakenduse aadressi ei õnnestunud tuvastada.' }

  revalidatePath('/manager/users')
  return { link: `${protocol}://${host}/register/${token}` }
}

export async function revokeWorkerInvite(formData: FormData) {
  await requireUser('manager')
  const id = String(formData.get('id') ?? '')
  const supabase = await createClient()
  const { error } = await supabase
    .from('user_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('used_at', null)
    .is('revoked_at', null)
  if (error) redirect(`/manager/users?error=${encodeURIComponent(error.message)}`)
  revalidatePath('/manager/users')
  redirect('/manager/users?revoked=1')
}
