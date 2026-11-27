import { monthRange } from './payroll.ts'

const employeeIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export type PayrollHistory = {month:string;employeeId:string;allDays:boolean}
export function payrollHistoryParams(params:Record<string,unknown>,fallbackMonth:string):PayrollHistory {
  let month=typeof params.month==='string'?params.month:fallbackMonth
  try {monthRange(month)} catch {month=fallbackMonth}
  return {month,employeeId:typeof params.employee==='string' && employeeIdPattern.test(params.employee)?params.employee:'',allDays:params.scope==='all'}
}
export function payrollHistoryUrl(history:PayrollHistory,saved?:string) {
  const query=new URLSearchParams({view:'summary',month:history.month})
  if(history.employeeId) query.set('employee',history.employeeId)
  if(history.allDays) query.set('scope','all')
  if(saved) query.set('saved',saved)
  return `/manager/time?${query}`
}
export function payrollHistoryRange(history:PayrollHistory) {
  return history.allDays ? null : monthRange(history.month)
}
