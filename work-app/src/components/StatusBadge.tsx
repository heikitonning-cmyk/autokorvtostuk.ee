import type { JobStatus } from '@/lib/domain'

const labels: Record<JobStatus, string> = {
  uus: 'Uus', kinnitatud: 'Kinnitatud', teel: 'Teel', toob: 'Töös', tehtud: 'Tehtud',
  vajab_jareltegevust: 'Vajab tegevust', tuhistatud: 'Tühistatud',
}

export function StatusBadge({ status }: { status: JobStatus }) {
  return <span className={`status status-${status}`}>{labels[status]}</span>
}
