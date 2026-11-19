
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { contentHash,archivePath,eligible,verifyCopy } from './core.ts';
const APP_KEY='50r9dh6b3zo88g1';
const CALLBACK='https://app.autokorvtostuk.ee/api/dropbox/callback';
const service=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const checked=async(p:PromiseLike<any>)=>{const r=await p;if(r.error)throw new Error('Andmete salvestamine ebaõnnestus.');return r.data;};
const secret=(name:string,value?:string)=>checked(service.rpc('photo_archive_secret',{p_name:name,p_value:value??null}));
const b64=(a:Uint8Array)=>btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
const sha=async(s:string)=>b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));
async function token(params:Record<string,string>){
 const r=await fetch('https://api.dropboxapi.com/oauth2/token',{method:'POST',body:new URLSearchParams({client_id:APP_KEY,...params}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error('Dropboxi ühendus vajab uuesti kinnitamist.');
 return r.json();
}
async function access(){
 const refresh=await secret('photo_archive_refresh');
 if(!refresh)throw new Error('Ühenda esmalt Dropbox seadete lehel.');
 return (await token({grant_type:'refresh_token',refresh_token:refresh})).access_token;
}
async function dbx(t:string,method:string,body:unknown,allowMissing=false){
 const r=await fetch('https://api.dropboxapi.com/2/'+method,{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 if(!r.ok){
  const e=await r.json().catch(()=>({}));
  if(allowMissing&&r.status===409&&String(e.error_summary).includes('not_found'))return null;
  throw new Error('Dropboxi toiming ebaõnnestus ('+r.status+'). Algne foto säilib.');
 }
 return r.json();
}
async function metadata(t:string,path:string){return dbx(t,'files/get_metadata',{path},true);}
async function updatePhoto(id:string,changes:Record<string,unknown>){
 const rows=await checked(service.from('job_photos').update(changes).eq('id',id).select('id'));
 if(rows.length!==1)throw new Error('Foto kirje muutus; toiming peatatud.');
}
async function archiveOne(photo:any,t:string){
 const now=new Date().toISOString();
 const path=photo.dropbox_path||archivePath(photo,photo.job);
 // Persist destination BEFORE upload, so retries use exactly the same destination.
 await updatePhoto(photo.id,{dropbox_path:path,archive_attempted_at:now,archive_error:null});
 let meta=await metadata(t,photo.dropbox_id||path);
 if(!photo.archived_at){
  const file=await checked(service.storage.from('job-photos').download(photo.storage_path));
  if(file.size>12*1024*1024)throw new Error('Foto on automaatseks arhiveerimiseks liiga suur.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const hash=await contentHash(bytes);
  if(!meta){
   // Create parent folder, tolerating an existing folder only.
   const folder=path.slice(0,path.lastIndexOf('/'));
   if(!await metadata(t,'/Toode fotod'))await dbx(t,'files/create_folder_v2',{path:'/Toode fotod',autorename:false});
   if(!await metadata(t,folder))await dbx(t,'files/create_folder_v2',{path:folder,autorename:false});
   const args=JSON.stringify({path,mode:'add',autorename:false,mute:true,strict_conflict:true}).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
   const upload=await fetch('https://content.dropboxapi.com/2/files/upload',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/octet-stream','Dropbox-API-Arg':args},body:bytes,signal:AbortSignal.timeout(30000)});
   if(!upload.ok)throw new Error('Foto üleslaadimine Dropboxi ebaõnnestus. Algne foto säilib.');
   await upload.json();
   meta=await metadata(t,path);
  }
  if(!meta)throw new Error('Dropboxi koopia puudub. Algne foto säilib.');
  verifyCopy(meta,bytes.length,hash);
  await updatePhoto(photo.id,{dropbox_id:meta.id,dropbox_hash:hash,archived_at:now});
  photo={...photo,dropbox_id:meta.id,dropbox_hash:hash};
 } else if(!meta||meta.content_hash!==photo.dropbox_hash) {
  throw new Error('Dropboxi koopia puudub või on muudetud. Algne foto säilib.');
 }
 // Metadata checkpoint is durable and verified before removing source.
 await checked(service.storage.from('job-photos').remove([photo.storage_path]));
 await updatePhoto(photo.id,{storage_removed_at:new Date().toISOString(),archive_error:null});
}
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try {
  const input=await req.json();
  let user:any=null;
  const cron=req.headers.get('x-photo-archive-cron');
  if(cron){
   if(cron!==await secret('photo_archive_cron')||input.action!=='archive-old')return json({error:'Keelatud'},403);
  }else{
   const auth=req.headers.get('Authorization')||'';
   const userClient=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
   const {data,error}=await userClient.auth.getUser();
   if(error||!data.user)return json({error:'Logi sisse'},401);
   const profile=await checked(service.from('users').select('id,role,active').eq('id',data.user.id).single());
   if(!profile?.active)return json({error:'Keelatud'},403);
   user=profile;
   if(input.action==='view'){
    const photo=await checked(userClient.from('job_photos').select('id,dropbox_id,storage_path').eq('id',input.photoId).maybeSingle());
    if(!photo)return json({error:'Fotot ei leitud'},404);
    if(photo.dropbox_id){
     const link=await dbx(await access(),'files/get_temporary_link',{path:photo.dropbox_id});
     return json({url:link.link});
    }
    const signed=await checked(userClient.storage.from('job-photos').createSignedUrl(photo.storage_path,300));
    return json({url:signed.signedUrl});
   }
   if(profile.role!=='manager')return json({error:'Ainult juhile'},403);
  }
  if(input.action==='status'){
   const c=await checked(service.from('photo_archive_connection').select('account_id,connected_at,last_run_at,last_result').eq('id',true).single());
   const {count:local,error:e1}=await service.from('job_photos').select('id',{count:'exact',head:true}).is('storage_removed_at',null);
   const {count:archived,error:e2}=await service.from('job_photos').select('id',{count:'exact',head:true}).not('archived_at','is',null);
   if(e1||e2)throw new Error('Fotode arvu lugemine ebaõnnestus.');
   return json({connected:!!c.account_id,connectedAt:c.connected_at,lastRun:c.last_run_at,lastResult:c.last_result,local,archived});
  }
  if(input.action==='connect'){
   const state=random(),verifier=random();
   await checked(service.from('photo_archive_oauth').delete().lt('expires_at',new Date().toISOString()));
   await checked(service.from('photo_archive_oauth').insert({state_hash:await sha(state),user_id:user.id,verifier,expires_at:new Date(Date.now()+600000).toISOString()}));
   const params=new URLSearchParams({client_id:APP_KEY,response_type:'code',redirect_uri:CALLBACK,token_access_type:'offline',code_challenge:await sha(verifier),code_challenge_method:'S256',state,scope:'account_info.read files.metadata.read files.content.read files.content.write'});
   return json({url:'https://www.dropbox.com/oauth2/authorize?'+params,state});
  }
  if(input.action==='callback'){
   if(typeof input.state!=='string'||typeof input.code!=='string')return json({error:'Puuduv kinnitus'},400);
   // Delete-returning consumes the one-time request atomically.
   const state=await checked(service.from('photo_archive_oauth').delete().eq('state_hash',await sha(input.state)).eq('user_id',user.id).gt('expires_at',new Date().toISOString()).select('verifier').maybeSingle());
   if(!state)return json({error:'Kinnitus aegus. Ühenda Dropbox uuesti.'},400);
   const t=await token({grant_type:'authorization_code',code:input.code,code_verifier:state.verifier,redirect_uri:CALLBACK});
   if(!t.refresh_token||!t.account_id)throw new Error('Dropbox ei andnud püsivat ühendust.');
   const c=await checked(service.from('photo_archive_connection').select('account_id').eq('id',true).single());
   if(c.account_id&&c.account_id!==t.account_id)throw new Error('Arhiiv on seotud teise Dropboxi kontoga. Kasuta algset kontot.');
   await secret('photo_archive_refresh',t.refresh_token);
   await checked(service.from('photo_archive_connection').update({account_id:t.account_id,connected_by:user.id,connected_at:new Date().toISOString()}).eq('id',true));
   return json({ok:true});
  }
  if(!['archive-old','archive-job','delete'].includes(input.action))return json({error:'Tundmatu toiming'},400);
  const lock=crypto.randomUUID();
  if(!await checked(service.rpc('photo_archive_lock',{p_id:lock})))return json({error:'Fotode toiming juba käib. Proovi mõne minuti pärast.'},409);
  try{
   if(input.action==='delete'){
    if(input.confirm!==true)return json({error:'Kustutamine vajab kinnitust'},400);
    const p=await checked(service.from('job_photos').select('*').eq('id',input.photoId).single());
    if(p.dropbox_path){
     const t=await access(),found=await metadata(t,p.dropbox_id||p.dropbox_path);
     if(found)await dbx(t,'files/delete_v2',{path:found.id});
    }
    if(!p.storage_removed_at)await checked(service.storage.from('job-photos').remove([p.storage_path]));
    await checked(service.from('job_photos').delete().eq('id',p.id));
    return json({ok:true});
   }
   const t=await access();
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Tallinn',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   let query=service.from('job_photos').select('*,job:jobs!inner(id,address,planned_date,actual_end,completed_at,status,dispatch_managed)').is('storage_removed_at',null).order('archive_attempted_at',{ascending:true,nullsFirst:true}).order('created_at');
   if(input.action==='archive-job'){
    if(typeof input.jobId!=='string')return json({error:'Puuduv töö'},400);
    query=query.eq('job_id',input.jobId);
   }else{
    const cutoff=new Date(Date.parse(today+'T00:00:00Z')-30*86400000).toISOString().slice(0,10);
    query=query.lt('job.planned_date',cutoff);
   }
   const rows=await checked(query.limit(200));
   const deadline=Date.now()+85000;
   let archived=0,failed=0,skipped=0;
   for(const p of rows){
    if(Date.now()>deadline||archived+failed>=20)break;
    if(input.action==='archive-old'&&!eligible(p.job,today)){skipped++;continue;}
    try{await archiveOne(p,t);archived++;}
    catch(e){failed++;await updatePhoto(p.id,{archive_error:e instanceof Error?e.message:'Arhiveerimine ebaõnnestus.',archive_attempted_at:new Date().toISOString()});}
   }
   const result={archived,failed,skipped};
   await checked(service.from('photo_archive_connection').update({last_run_at:new Date().toISOString(),last_result:result}).eq('id',true));
   return json(result);
  }finally{await checked(service.rpc('photo_archive_lock',{p_id:lock,p_release:true}));}
 }catch(e){return json({error:e instanceof Error?e.message:'Toiming ebaõnnestus.'},400);}
});
