'use client'
import { useState } from 'react'

export function DeliveryInvoiceLine({number,total}:{number:string;total:number}) {
  const [message,setMessage]=useState('')
  const text=`Tõstukiteenus vastavalt saatelehele nr ${number}`
  async function copy() {
    try{await navigator.clipboard.writeText(text);setMessage('Arve rida kopeeritud.')}
    catch{setMessage('Vali allolev tekst ja kopeeri see käsitsi.')}
  }
  return <div className="stack" style={{minWidth:0}}>
    <label>Arvele üks rida<textarea readOnly value={text} rows={2} style={{fontSize:16}} onFocus={e=>e.currentTarget.select()}/></label>
    <p>1 kmpl · <strong>{(total/100).toLocaleString('et-EE',{style:'currency',currency:'EUR'})}</strong></p>
    <button type="button" className="button secondary" onClick={copy}>Kopeeri arve rida</button>
    {message&&<small role="status">{message}</small>}
  </div>
}
