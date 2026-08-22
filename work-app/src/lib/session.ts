import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { AppUser, UserRole } from '@/lib/domain'
import { homeForRole } from '@/lib/auth'

export async function currentUser(): Promise<AppUser | null> {
  const supabase = await createClient()
  const { data: claimsData, error } = await supabase.auth.getClaims()
  const id = claimsData?.claims?.sub
  if (error || !id) return null

  const { data } = await supabase
    .from('users')
    .select('id,name,email,phone,role,active')
    .eq('id', id)
    .single()

  return data as AppUser | null
}

export async function requireUser(role?: UserRole): Promise<AppUser> {
  const user = await currentUser()
  if (!user || !user.active) redirect('/login')
  if (role && user.role !== role) redirect(homeForRole(user.role))
  return user
}
