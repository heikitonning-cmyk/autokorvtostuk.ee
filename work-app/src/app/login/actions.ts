'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { homeForRole } from '@/lib/auth'

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) redirect('/login?error=1')

  const { data: claims } = await supabase.auth.getClaims()
  const id = claims?.claims?.sub
  if (!id) redirect('/login?error=1')
  const { data: profile } = await supabase.from('users').select('role').eq('id', id).single()
  if (!profile?.role) redirect('/login?error=profile')
  redirect(homeForRole(profile.role))
}
