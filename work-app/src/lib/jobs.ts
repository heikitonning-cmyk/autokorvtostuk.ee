export interface NewJobInput {
  customerId: string
  startPlanned: string
  address: string
  workTypeId: string
  operatorId: string
}

export interface FinishJobInput {
  actualKm: number | null
  billingConfirmed: boolean
  photoCount: number
}

export function validateNewJob(input: NewJobInput): (keyof NewJobInput)[] {
  const required: (keyof NewJobInput)[] = ['customerId', 'startPlanned', 'address', 'workTypeId', 'operatorId']
  return required.filter((key) => String(input[key] ?? '').trim() === '')
}

export function validateFinishJob(input: FinishJobInput): ('actualKm' | 'billingConfirmed' | 'photo')[] {
  const missing: ('actualKm' | 'billingConfirmed' | 'photo')[] = []
  if (input.actualKm === null || input.actualKm < 0) missing.push('actualKm')
  if (!input.billingConfirmed) missing.push('billingConfirmed')
  if (input.photoCount < 1) missing.push('photo')
  return missing
}
