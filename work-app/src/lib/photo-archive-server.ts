import 'server-only'
import { createClient } from '@/lib/supabase/server'
export async function photoArchive(body:Record<string,unknown>) {
 const supabase=await createClient()
 const {data,error}=await supabase.functions.invoke('photo-archive',{body})
 if(error) {
  let message='Fotoarhiivi toiming ebaõnnestus. Proovi uuesti.'
  try { const result=await error.context?.json(); if(result?.error)message=result.error } catch {}
  throw new Error(message)
 }
 if(data?.error)throw new Error(data.error)
 return data
}
