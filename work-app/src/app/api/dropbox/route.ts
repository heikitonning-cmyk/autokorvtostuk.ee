import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/session'
import { photoArchive } from '@/lib/photo-archive-server'
export async function POST(request:Request) {
 const user=await currentUser()
 if(!user?.active||user.role!=='manager')return NextResponse.json({error:'Ainult juhile'},{status:403})
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Keelatud'},{status:403})
 try {
  const input=await request.json()
  if(!['status','connect','archive-old','archive-job','delete'].includes(input.action))return NextResponse.json({error:'Tundmatu toiming'},{status:400})
  const data=await photoArchive(input)
  const response=NextResponse.json(input.action==='connect'?{url:data.url}:data)
  response.headers.set('Cache-Control','no-store')
  if(input.action==='connect')response.cookies.set('dropbox_oauth_state',data.state,{httpOnly:true,secure:true,sameSite:'lax',maxAge:600,path:'/api/dropbox/callback'})
  return response
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Toiming ebaõnnestus'},{status:400})}
}
