import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { photoArchive } from '@/lib/photo-archive-server'
export const dynamic='force-dynamic'
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const headers={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer'}
 const user=await currentUser()
 if(!user?.active)return new NextResponse('Logi sisse',{status:401,headers})
 try {
  const {id}=await params
  const db=await createClient()
  // Use the signed-in user's RLS permissions, never a service-role client.
  const {data:photo,error}=await db.from('job_photos').select('id,storage_path,dropbox_id').eq('id',id).single()
  if(error||!photo)throw new Error('Photo unavailable')
  let url:string
  if(photo.dropbox_id) url=(await photoArchive({action:'view',photoId:id})).url
  else {
   const {data,error:signError}=await db.storage.from('job-photos').createSignedUrl(photo.storage_path,300)
   if(signError||!data?.signedUrl)throw new Error('Photo unavailable')
   url=data.signedUrl
  }
  return NextResponse.redirect(url,{status:307,headers})
 }catch{return new NextResponse('Foto avamine ebaõnnestus. Värskenda lehte või võta ühendust juhiga.',{status:404,headers})}
}
