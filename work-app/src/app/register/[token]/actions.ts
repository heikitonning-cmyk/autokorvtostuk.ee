'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hashInviteToken, registrationErrorMessage } from '@/lib/invites'

function registerUrl(token: string, error: string) {
  return `/register/${encodeURIComponent(token)}?error=${encodeURIComponent(error)}`
}

export async function registerWorker(formData: FormData) {
  const token = String(formData.get('token') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const phone = String(formData.get('phone') ?? '').trim()

  if (!token) redirect('/login?error=invite')
  if (!name) redirect(registerUrl(token, 'Nimi on vajalik.'))
  if (!email) redirect(registerUrl(token, 'E-post on vajalik.'))
  if (password.length < 6) redirect(registerUrl(token, 'Parool peab olema vähemalt 6 tähemärki.'))

  const tokenHash = hashInviteToken(token)
  const supabase = await createClient()
  const { data: valid, error: validationError } = await supabase.rpc('validate_user_invite', { p_token_hash: tokenHash })
  if (validationError || !valid) redirect(registerUrl(token, 'Kutselink on vigane, aegunud või juba kasutatud.'))

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        app_registration: 'worker_invite',
        invite_hash: tokenHash,
        name,
        phone: phone || null,
      },
    },
  })

  if (error) redirect(registerUrl(token, registrationErrorMessage(error.message)))
  if (!data.user || data.user.identities?.length === 0) redirect(registerUrl(token, 'Selle e-postiga kasutaja on juba olemas.'))
  if (data.session) redirect('/operator')
  redirect('/login?registered=1')
}
