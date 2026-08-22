import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { currentUser } from '@/lib/session'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id: jobId } = await params
  const supabase = await createClient()
  const { data: job } = await supabase.from('jobs').select('id,operator_id').eq('id', jobId).single()
  if (!job || (user.role === 'operator' && job.operator_id !== user.id)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File) || !file.type.startsWith('image/')) return NextResponse.json({ error: 'invalid file' }, { status: 400 })
  if (file.size > 12 * 1024 * 1024) return NextResponse.json({ error: 'file too large' }, { status: 413 })
  const category = String(form.get('category') ?? 'during')
  const safeCategory = ['before','during','after','issue'].includes(category) ? category : 'during'
  const ext = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'jpg'
  const path = `${jobId}/${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage.from('job-photos').upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) return NextResponse.json({ error: 'upload failed' }, { status: 500 })
  const { error: rowError } = await supabase.from('job_photos').insert({ job_id: jobId, uploaded_by: user.id, storage_path: path, category: safeCategory })
  if (rowError) {
    await supabase.storage.from('job-photos').remove([path])
    return NextResponse.json({ error: 'metadata failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
