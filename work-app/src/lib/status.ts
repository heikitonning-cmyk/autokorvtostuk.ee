import type { AppUser, JobStatus } from './domain.ts'

const transitions: Record<JobStatus, readonly JobStatus[]> = {
  uus: ['kinnitatud', 'tuhistatud'],
  kinnitatud: ['teel', 'toob', 'tuhistatud'],
  teel: ['toob', 'tuhistatud'],
  toob: ['tehtud', 'vajab_jareltegevust'],
  tehtud: ['vajab_jareltegevust'],
  completed: [],
  vajab_jareltegevust: ['tehtud'],
  tuhistatud: [],
}

export function isCompletedJob(job: { status: string }): boolean {
  return ['completed', 'tehtud', 'vajab_jareltegevust'].includes(job.status)
}

export function isActiveJob(job: { status: string }): boolean {
  return ['uus', 'kinnitatud', 'teel', 'toob'].includes(job.status)
}

export function canMarkJobCompleted(
  user: Pick<AppUser, 'id' | 'role' | 'active'> | null,
  job: { status: string; operator_id: string | null },
): boolean {
  return Boolean(user?.active && isActiveJob(job) &&
    (user.role === 'manager' || (user.role === 'operator' && job.operator_id === user.id)))
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
