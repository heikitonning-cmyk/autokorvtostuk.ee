/** Camera wall-clock time; do not guess a timezone or use file modification time. */
export function normalizeCaptureTime(value:unknown):string|null {
  if(typeof value!=='string') return null
  const match=/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value)
  if(!match) return null
  const [,y,m,d,h,min,s]=match
  const iso=`${y}-${m}-${d}T${h}:${min}:${s}`
  const date=new Date(iso+'Z')
  if(+y<1900||+y>2099||!Number.isFinite(date.getTime())||date.toISOString().slice(0,19)!==iso) return null
  return iso
}

/** Read JPEG EXIF DateTimeOriginal only. Invalid/unsupported metadata is optional. */
export function jpegCaptureTime(buffer:ArrayBuffer):string|null {
  try {
    const view=new DataView(buffer),bytes=new Uint8Array(buffer)
    if(view.getUint16(0)!==0xffd8) return null
    let pos=2
    while(pos+4<=view.byteLength) {
      if(bytes[pos]!==0xff) return null
      const marker=bytes[pos+1]
      if(marker===0xda||marker===0xd9) break
      const size=view.getUint16(pos+2),end=pos+2+size
      if(size<2||end>view.byteLength) return null
      if(marker===0xe1&&String.fromCharCode(...bytes.slice(pos+4,pos+10))==='Exif\0\0') {
        const base=pos+10
        const order=view.getUint16(base),little=order===0x4949
        if(order!==0x4949&&order!==0x4d4d) return null
        const u16=(p:number)=>{if(p<base||p+2>end)throw new Error();return view.getUint16(p,little)}
        const u32=(p:number)=>{if(p<base||p+4>end)throw new Error();return view.getUint32(p,little)}
        if(u16(base+2)!==42) return null
        const find=(offset:number,tag:number)=>{
          const start=base+offset,count=u16(start)
          if(start+2+count*12+4>end) throw new Error()
          for(let i=0;i<count;i++){const entry=start+2+i*12;if(u16(entry)===tag)return entry}
          return null
        }
        const pointer=find(u32(base+4),0x8769)
        if(pointer===null||u16(pointer+2)!==4||u32(pointer+4)!==1) return null
        const original=find(u32(pointer+8),0x9003)
        if(original===null||u16(original+2)!==2||u32(original+4)!==20) return null
        const address=base+u32(original+8)
        if(address<base||address+20>end) return null
        return normalizeCaptureTime(String.fromCharCode(...bytes.slice(address,address+19)))
      }
      pos=end
    }
  } catch { /* Missing or malformed EXIF must never block a photo upload. */ }
  return null
}

export function photoTimeLabel(photo:{captured_at?:string|null;created_at?:string|null}):string {
  const captured=normalizeCaptureTime(photo.captured_at)
  if(captured) return `Pildistatud ${captured.slice(8,10)}.${captured.slice(5,7)}.${captured.slice(0,4)} kell ${captured.slice(11,16)} · kaamera aeg`
  if(photo.created_at&&Number.isFinite(Date.parse(photo.created_at))) return 'Üles laaditud '+new Intl.DateTimeFormat('et-EE',{timeZone:'Europe/Tallinn',dateStyle:'short',timeStyle:'short'}).format(new Date(photo.created_at))+' · pildistamise aeg puudub'
  return 'Pildistamise aeg puudub'
}
