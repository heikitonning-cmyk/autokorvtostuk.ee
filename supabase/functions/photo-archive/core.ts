
export async function contentHash(bytes: Uint8Array): Promise<string> {
  const blocks: Uint8Array[] = [];
  for (let i=0;i<bytes.length;i+=4194304) blocks.push(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice(i,i+4194304))));
  const joined=new Uint8Array(blocks.length*32);
  blocks.forEach((b,i)=>joined.set(b,i*32));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',joined)),b=>b.toString(16).padStart(2,'0')).join('');
}
export function archivePath(photo: {id:string;storage_path:string},job:{id:string;address?:string;planned_date?:string}):string {
 const address=(job.address||'Aadress määramata').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/[. ]+$/,'').slice(0,90);
 const ext=photo.storage_path.split('.').pop()?.toLowerCase();
 const suffix=ext&&/^[a-z0-9]{1,8}$/.test(ext)?ext:'jpg';
 return '/Toode fotod/'+(job.planned_date||'Kuupaevata')+' '+address+' '+job.id+'/'+photo.id+'.'+suffix;
}
export function eligible(job:{planned_date?:string;completed_at?:string;actual_end?:string;status?:string;dispatch_managed?:boolean},today:string):boolean {
 if(job.status==='tuhistatud'||job.status==='toös'||job.status==='toos')return false;
 const date=(job.completed_at||job.actual_end||job.planned_date||'').slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const done=job.dispatch_managed||['completed','tehtud','vajab_jareltegevust'].includes(job.status||'');
 return !!done && Date.parse(today+'T00:00:00Z')-Date.parse(date+'T00:00:00Z')>30*86400000;
}
export function verifyCopy(meta:{size:number;content_hash:string},bytes:number,hash:string):void {
 if(meta.size!==bytes||meta.content_hash!==hash)throw new Error('Foto koopia kontroll ebaõnnestus; algne foto säilib.');
}
