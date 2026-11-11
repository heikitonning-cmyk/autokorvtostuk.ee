import { formatPlannedTime } from './jobs.ts'
import { isActiveJob, isCompletedJob } from './status.ts'
import { tallinnDate } from './payroll.ts'

export type OperatorPlanView = 'active' | 'history' | 'calendar'
type PlanJob = {
  status: string
  planned_date?: string | null
  planned_time?: string | null
  planned_end_time?: string | null
  start_planned?: string | null
  end_planned?: string | null
}

export function operatorJobDate(job: PlanJob): string | null {
  if (job.planned_date) return job.planned_date
  if (!job.start_planned) return null
  const start = new Date(job.start_planned)
  return Number.isNaN(start.getTime()) ? null : tallinnDate(start)
}

export function operatorPlanJobs<T extends PlanJob>(jobs: T[], view: OperatorPlanView, today: string): T[] {
  return jobs.filter(job => {
    if (job.status === 'tuhistatud') return false
    if (view === 'calendar') return true
    const date = operatorJobDate(job)
    if (view === 'history') return Boolean(date && date < today) || isCompletedJob(job)
    return isActiveJob(job) && (!date || date >= today)
  }).sort((a, b) => {
    const aTime = formatPlannedTime(a.start_planned, a.planned_time)
    const bTime = formatPlannedTime(b.start_planned, b.planned_time)
    return aTime.localeCompare(bTime)
  })
}

export function operatorJobTime(job: PlanJob): string {
  const start = formatPlannedTime(job.start_planned, job.planned_time)
  const end = formatPlannedTime(job.end_planned, job.planned_end_time)
  return end === 'Aeg määramata' ? start : `${start}–${end}`
}
