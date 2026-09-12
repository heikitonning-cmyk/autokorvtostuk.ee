import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { hashInviteToken } from '@/lib/invites'
import { registerWorker } from './actions'

export default async function RegisterPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ token }, query] = await Promise.all([params, searchParams])
  const tokenHash = hashInviteToken(token)
  const supabase = await createClient()
  const { data: valid } = await supabase.rpc('validate_user_invite', { p_token_hash: tokenHash })
  const errorText = Array.isArray(query.error) ? query.error[0] : query.error

  if (!valid) return <main className="login-page"><section className="login-card">
    <div className="brand-mark">EK</div>
    <p className="eyebrow">Euro Kapital OÜ</p>
    <h1>Kutselink ei kehti</h1>
    <p className="muted">Link on vigane, aegunud, tühistatud või juba kasutatud. Küsi juhilt uus kutselink.</p>
    <Link className="button secondary wide top-gap" href="/login">Tagasi sisselogimisse</Link>
  </section></main>

  return <main className="login-page"><section className="login-card">
    <div className="brand-mark">EK</div>
    <p className="eyebrow">Euro Kapital OÜ</p>
    <h1>Loo kasutaja</h1>
    <p className="muted">See konto annab ainult Kasutaja vaate. Juhi õigusi selle lingiga luua ei saa.</p>
    {errorText && <div className="alert danger top-gap">{errorText}</div>}
    <form action={registerWorker} className="stack top-gap">
      <input type="hidden" name="token" value={token} />
      <label>Nimi<input name="name" autoComplete="name" required /></label>
      <label>E-post<input name="email" type="email" autoComplete="email" required /></label>
      <label>Telefon (soovi korral)<input name="phone" type="tel" autoComplete="tel" /></label>
      <label>Parool<input name="password" type="password" minLength={6} autoComplete="new-password" required /></label>
      <button className="button primary wide" type="submit">Loo kasutaja</button>
    </form>
  </section></main>
}
