import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { currentUser } from '@/lib/session'
import { getPricingSettings } from '@/lib/queries'
import { deliverySnapshot, validateSignature } from '@/lib/delivery-sheet'

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  if(request.headers.get('origin')!==new URL(request.url).origin) return NextResponse.json({error:'Keelatud päring.'},{status:403})
  const user=await currentUser()
  if(!user?.active||!['manager','operator'].includes(user.role)) return NextResponse.json({error:'Palun logi uuesti sisse.'},{status:401})
  const {id}=await params,supabase=await createClient()
  const {data:job,error}=await supabase.from('jobs').select('*,customer:customers(name,phone,email,billing_address),vehicle:vehicles(registration_number)').eq('id',id).single()
  if(error||!job||job.status==='tuhistatud') return NextResponse.json({error:'Töö pole saadaval.'},{status:403})
  try {
    const bodyText=await request.text()
    if(bodyText.length>300000) return NextResponse.json({error:'Allkiri on liiga mahukas.'},{status:413})
    const body=JSON.parse(bodyText)
    const snapshot=deliverySnapshot(job,await getPricingSettings(),body.input)
    if(body.action==='preview') return NextResponse.json({snapshot},{headers:{'Cache-Control':'no-store'}})
    if(body.action!=='sign'||body.confirmed!==true) throw new Error('Tellija peab kinnitama saatelehe andmed.')
    // Never attach an existing signature to newly changed prices or job details.
    if(JSON.stringify(snapshot)!==JSON.stringify(body.snapshot)) return NextResponse.json({error:'Töö andmed või hind muutusid. Ava uuesti eelvaade ja palu tellijal uuesti allkirjastada.'},{status:409})
    const signature=validateSignature(body.signature)
    const {data:saved,error:saveError}=await supabase.from('job_delivery_sheets').insert({job_id:id,snapshot,signature,created_by:user.id}).select('*').single()
    if(saveError) return NextResponse.json({error:saveError.code==='23505'?'Selle töö saateleht on juba allkirjastatud. Värskenda lehte.':'Saatelehte ei õnnestunud salvestada. Allkiri on alles; proovi uuesti.'},{status:saveError.code==='23505'?409:500})
    revalidatePath(`/manager/jobs/${id}`);revalidatePath(`/operator/jobs/${id}`)
    return NextResponse.json({saved},{headers:{'Cache-Control':'no-store'}})
  } catch(error) {return NextResponse.json({error:error instanceof Error?error.message:'Kontrolli saatelehe andmeid.'},{status:400})}
}
