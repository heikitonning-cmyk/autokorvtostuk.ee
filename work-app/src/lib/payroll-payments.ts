export type PayrollPayment = {
  id: string; employee_id: string; paid_date: string; amount_cents: number
  note: string; updated_at: string; voided_at: string | null
}
export type PayrollBalance = {
  employee_id: string; earned_cents: number; paid_cents: number; balance_cents: number
}

export function parsePaymentAmount(value: string): number {
  const normalized = value.trim().replace(',', '.')
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(normalized)) throw new Error('Sisesta summa kuni kahe komakohaga (kuni 999 999,99 €).')
  const [whole, fraction=''] = normalized.split('.')
  const cents = Number(whole)*100 + Number(fraction.padEnd(2,'0'))
  if (cents <= 0) throw new Error('Makstud summa peab olema suurem kui 0.')
  return cents
}

export function balanceAfterPayment(balance: PayrollBalance | undefined, amount: number, previous?: PayrollPayment): number {
  const restored = previous && !previous.voided_at && previous.employee_id===balance?.employee_id ? previous.amount_cents : 0
  return (balance?.balance_cents ?? 0) + restored - amount
}

export function balanceTotals(balances: PayrollBalance[]) {
  return balances.reduce((sum,b)=>({due:sum.due+Math.max(0,b.balance_cents),advance:sum.advance+Math.max(0,-b.balance_cents)}),{due:0,advance:0})
}
