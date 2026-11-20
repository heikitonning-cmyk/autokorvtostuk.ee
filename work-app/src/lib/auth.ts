import type { UserRole } from './domain.ts'

export type AppView = 'manager' | 'worker'

export function homeForRole(role: UserRole): '/manager' | '/operator' {
  return role === 'manager' ? '/manager' : '/operator'
}

export function canAccessView(role: UserRole, view: AppView): boolean {
  if (view === 'manager') return role === 'manager'
  return role === 'manager' || role === 'operator'
}
