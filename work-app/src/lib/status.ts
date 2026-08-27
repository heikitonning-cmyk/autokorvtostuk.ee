import type { JobStatus } from './domain.ts'

const transitions: Record<JobStatus, readonly JobStatus[]> = {
  uus: ['kinnitatud', 'tuhistatud'],
  kinnitatud: ['teel', 'toob', 'tuhistatud'],
  teel: ['toob', 'tuhistatud'],
  toob: ['tehtud', 'vajab_jareltegevust'],
  tehtud: ['vajab_jareltegevust'],
  vajab_jareltegevust: ['tehtud'],
  tuhistatud: [],
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return transitions[from].includes(to)
}

export function completionStatus(input: {
  actualKm: number | null
  billingConfirmed: boolean
  photoCount: number
}): Extract<JobStatus, 'tehtud' | 'vajab_jareltegevust'> {
  return input.actualKm !== null && input.actualKm >= 0 && input.billingConfirmed && input.photoCount > 0
    ? 'tehtud'
    : 'vajab_jareltegevust'
}
