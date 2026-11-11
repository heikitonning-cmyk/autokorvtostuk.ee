import { createHash } from 'node:crypto'

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function registrationErrorMessage(message: string | null | undefined): string {
  const text = String(message ?? '').trim()
  if (!text) return 'Konto loomine ei õnnestunud.'
  if (/already registered|already exists|user.*exists/i.test(text)) return 'Selle e-postiga kasutaja on juba olemas.'
  if (/kutselink|invite/i.test(text)) return 'Kutselink on vigane, aegunud või juba kasutatud.'
  return text
}
