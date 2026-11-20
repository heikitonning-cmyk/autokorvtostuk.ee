import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { currentUser } from '@/lib/session'
import { photoArchive } from '@/lib/photo-archive-server'
export async function GET(request:Request) {
 const url=new URL(request.url),cookieStore=await cookies()
 const state=url.searchParams.get('state'),code=url.searchParams.get('code')
 const response=NextResponse.redirect(new URL('/manager/settings?dropbox=error',url.origin))
 response.cookies.set('dropbox_oauth_state','',{maxAge:0,path:'/api/dropbox/callback'})
 response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer')
 const user=await currentUser()
 if(!user?.active||user.role!=='manager'||!state||!code||state!==cookieStore.get('dropbox_oauth_state')?.value)return response
 try {
  await photoArchive({action:'callback',state,code})
  response.headers.set('Location',new URL('/manager/settings?dropbox=connected',url.origin).toString())
 }catch{}
 return response
}
