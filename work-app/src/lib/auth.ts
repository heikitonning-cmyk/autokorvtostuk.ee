import type { UserRole } from './domain.ts'

export function homeForRole(role: UserRole): '/manager' | '/operator' {
  return role === 'manager' ? '/manager' : '/operator'
}
