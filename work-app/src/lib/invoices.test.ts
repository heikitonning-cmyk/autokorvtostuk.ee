import test from 'node:test'
import assert from 'node:assert/strict'
import {addCalendarDays,dayDifference,invoiceBadge,dueLabel,invoiceTotals,invoiceMatches,parseInvoiceAmount,invoiceCustomer,type InvoiceWithJob} from './invoices.ts'
const sample:InvoiceWithJob={job_id:'job',status:'draft',amount_cents:9000,amount_override:false,invoice_number:null,issued_on:null,due_on:null,paid_on:null,version:1,updated_at:'',updated_by:null,job:{id:'job',address:'Vaadi tee 9',object_name:null,planned_date:'2026-11-18',estimated_total:90,customer:{name:'Test tellija'}}}
test('seven calendar days across month, year and daylight savings boundaries',()=>{
 for(const [from,to] of [['2026-11-19','2026-11-26'],['2026-12-28','2027-01-04'],['2026-03-27','2026-04-03'],['2026-10-23','2026-10-30']]){assert.equal(addCalendarDays(from,7),to);assert.equal(dayDifference(from,to),7)}
 assert.equal(addCalendarDays('2028-02-28',1),'2028-02-29')
 assert.throws(()=>addCalendarDays('2026-02-30',7));assert.throws(()=>addCalendarDays('2026-11-19',-1))
})
test('due today is unpaid, yesterday is overdue, paid invoices never overdue',()=>{
 assert.equal(invoiceBadge({...sample,status:'unpaid',due_on:'2026-11-19'},'2026-11-19').tone,'unpaid')
 assert.equal(invoiceBadge({...sample,status:'unpaid',due_on:'2026-11-18'},'2026-11-19').tone,'overdue')
 assert.equal(invoiceBadge({...sample,status:'paid',due_on:'2026-11-18'},'2026-11-19').tone,'paid')
 assert.equal(dueLabel('2026-11-19','2026-11-19'),'Tähtaeg täna')
 assert.equal(dueLabel('2026-11-17','2026-11-19'),'Tähtaeg ületatud 2 päeva')
})
test('active totals exclude archive and overdue is a subset of unpaid',()=>{
 assert.deepEqual(invoiceTotals([sample,{...sample,status:'unpaid',amount_cents:12000,due_on:'2026-11-18'},{...sample,status:'unpaid',amount_cents:3000,due_on:'2026-11-26'},{...sample,status:'paid',amount_cents:50000,due_on:'2026-11-01'},{...sample,amount_cents:null}],'2026-11-19'),{draft:9000,unpaid:15000,overdue:12000,unknown:1})
})
test('archive search supports customer, address, invoice number and ISO/Estonian dates',()=>{
 const i={...sample,status:'paid' as const,invoice_number:'EK-101',paid_on:'2026-11-19'}
 for(const q of ['TEST TELLIJA','Vaadi','ek-101','19.11.2026','2026-11-18'])assert.equal(invoiceMatches(i,q),true)
 assert.equal(invoiceMatches(i,'unrelated'),false)
})
test('invoice amount uses exact cents and rejects ambiguous or invalid input',()=>{
 for(const [value,cents] of [['90',9000],['123,45',12345],['0.01',1],['0',0]] as const)assert.equal(parseInvoiceAmount(value),cents)
 for(const value of ['-1','1e3','12.345','','NaN','1,234.50'])assert.throws(()=>parseInvoiceAmount(value))
})

test('website booking customer uses the existing snake_case fields',()=>{
 const i={...sample,job:{...sample.job!,customer:null,website_booking_details:{customer_name:'Korteriühistu test',contact_name:'Kontakt'}}}
 assert.equal(invoiceMatches(i,'Korteriühistu test'),true)
})

test('payer name is displayed and searchable independently of job address and customer',()=>{
 const i={...sample,payer_name:'Teine Maksja OÜ'}
 assert.equal(invoiceCustomer(i),'Teine Maksja OÜ')
 for(const q of ['teine maksja','Vaadi','Test tellija'])assert.equal(invoiceMatches(i,q),true)
 assert.equal(invoiceCustomer({...i,payer_name:'  '}),'Test tellija')
 assert.equal(sample.job?.address,'Vaadi tee 9')
})
