import type { JobStatus } from './domain.ts'

export interface SummaryJob {
  id: string
  status: JobStatus
  start_planned: string
  estimated_total: number | null
  actual_total: number | null
}

function tallinnDateKey(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Tallinn',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value)
}

export function managerSummary(jobs: SummaryJob[], now = new Date()) {
  const todayKey = tallinnDateKey(now)
  const todayJobs = jobs.filter((job) => tallinnDateKey(new Date(job.start_planned)) === todayKey)
  const newJobs = jobs.filter((job) => job.status === 'uus')
  const overdueNotStarted = jobs.filter((job) =>
    (job.status === 'kinnitatud' || job.status === 'teel') && new Date(job.start_planned).getTime() < now.getTime()
  )
  const followUp = jobs.filter((job) => job.status === 'vajab_jareltegevust')
  const todayRevenue = todayJobs.reduce((sum, job) => sum + Number(job.actual_total ?? job.estimated_total ?? 0), 0)

  return { todayJobs, newJobs, overdueNotStarted, followUp, todayRevenue }
}

export function freeCapacityDays(
  jobs: Array<{ start_planned: string; end_planned?: string | null; status: JobStatus }>,
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
      .filter((job) => job.status !== 'tuhistatud' && tallinnDateKey(new Date(job.start_planned)) === date)
      .reduce((sum, job) => {
        const start = new Date(job.start_planned).getTime()
        const end = job.end_planned ? new Date(job.end_planned).getTime() : start + 2 * 3600000
        return sum + Math.max(0, (end - start) / 3600000)
      }, 0)
    return { date, freeHours: Math.max(0, Math.round((8 - bookedHours) * 10) / 10) }
  }).filter((day) => day.freeHours >= 2)
}
