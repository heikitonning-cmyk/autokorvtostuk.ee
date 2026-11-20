export type PayrollRate = {effective_from:string;hourly_rate_cents:number;previous_rate_cents:number}
export function payrollRateForDate(employee:{hourly_rate_cents:number;rate_history?:PayrollRate[]},date:string,entryRate?:number) {
 const history=[...(employee.rate_history??[])].sort((a,b)=>a.effective_from.localeCompare(b.effective_from))
 const effective=history.filter(r=>r.effective_from<=date).at(-1)
 return effective?.hourly_rate_cents??entryRate??history[0]?.previous_rate_cents??employee.hourly_rate_cents
}
