import type { JobStatus } from './domain.ts'

export interface SummaryJob {
  id: string
  status: JobStatus
  start_planned: string | null
  planned_date?: string | null
  estimated_total: number | null
  actual_total: number | null
}

function tallinnDateKey(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Tallinn',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value)
}

function plannedTimestamp(job: Pick<SummaryJob, 'start_planned' | 'planned_date'>): number {
  if (job.start_planned) return new Date(job.start_planned).getTime()
  if (job.planned_date) return new Date(`${job.planned_date}T12:00:00Z`).getTime()
  return Number.NaN
}

export function jobsWithinDays(jobs: SummaryJob[], days: number, now = new Date()): SummaryJob[] {
  const nowMs = now.getTime()
  return jobs.filter((job) => {
    if (job.status === 'tuhistatud') return false
    const timestamp = plannedTimestamp(job)
    return Number.isFinite(timestamp) && Math.abs(timestamp - nowMs) <= days * 86400000
  })
}

export function managerSummary(jobs: SummaryJob[], now = new Date()) {
  const activeJobs = jobs.filter((job) => job.status !== 'tuhistatud')
  const todayKey = tallinnDateKey(now)
  const todayJobs = activeJobs.filter((job) => job.start_planned
    ? tallinnDateKey(new Date(job.start_planned)) === todayKey
    : job.planned_date === todayKey)
  const newJobs = activeJobs.filter((job) => job.status === 'uus')
  const overdueNotStarted = activeJobs.filter((job) =>
    Boolean(job.start_planned) &&
    (job.status === 'kinnitatud' || job.status === 'teel') &&
    new Date(job.start_planned as string).getTime() < now.getTime()
  )
  const followUp = activeJobs.filter((job) => job.status === 'vajab_jareltegevust')
  const todayRevenue = todayJobs.reduce((sum, job) => sum + Number(job.actual_total ?? job.estimated_total ?? 0), 0)

  return { todayJobs, newJobs, overdueNotStarted, followUp, todayRevenue }
}

export function freeCapacityDays(
  jobs: Array<{ start_planned: string | null; end_planned?: string | null; status: JobStatus }>,
  now = new Date(),
) {
  const base = tallinnDateKey(now)
  const days = Array.from({ length: 7 }, (_, index) => {
    const d = new Date(`${base}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + index + 1)
    return d.toISOString().slice(0, 10)
  })

  return days.map((date) => {
    const bookedHours = jobs
      .filter((job) => job.status !== 'tuhistatud' && Boolean(job.start_planned) && tallinnDateKey(new Date(job.start_planned as string)) === date)
      .reduce((sum, job) => {
        const start = new Date(job.start_planned as string).getTime()
        const end = job.end_planned ? new Date(job.end_planned).getTime() : start + 2 * 3600000
        return sum + Math.max(0, (end - start) / 3600000)
      }, 0)
    return { date, freeHours: Math.max(0, Math.round((8 - bookedHours) * 10) / 10) }
  }).filter((day) => day.freeHours >= 2)
}
