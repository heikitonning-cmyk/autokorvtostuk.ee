import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/session'
import { photoArchive } from '@/lib/photo-archive-server'
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const user=await currentUser()
 if(!user?.active)return new NextResponse('Logi sisse',{status:401})
 try {
  const {id}=await params,data=await photoArchive({action:'view',photoId:id})
  const response=NextResponse.redirect(data.url)
  response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy','no-referrer')
  return response
 }catch{return new NextResponse('Foto avamine ebaõnnestus. Värskenda lehte või võta ühendust juhiga.',{status:404})}
}
