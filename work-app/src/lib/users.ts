import { createClient } from '@/lib/supabase/server'

export async function getUsersAndInvites() {
  const supabase = await createClient()
  const [users, invites] = await Promise.all([
    supabase
      .from('users')
      .select('id,name,email,phone,role,active,created_at')
      .order('name'),
    supabase
      .from('user_invites')
      .select('id,role,created_at,expires_at,used_at,used_by,revoked_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ])
  if (users.error) throw users.error
  if (invites.error) throw invites.error
  return { users: users.data ?? [], invites: invites.data ?? [] }
}
