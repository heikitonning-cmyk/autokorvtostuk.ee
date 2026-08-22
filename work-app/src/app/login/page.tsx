import { login } from './actions'

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const hasError = Boolean(params.error)
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">EK</div>
        <p className="eyebrow">Euro Kapital OÜ</p>
        <h1>Tööäpp</h1>
        <p className="muted">Autokorvtõstuki tööd, operaator ja päeva juhtimine ühes kohas.</p>
        {hasError && <div className="alert danger">Sisselogimine ei õnnestunud. Kontrolli e-posti ja parooli.</div>}
        <form action={login} className="stack">
          <label>E-post<input name="email" type="email" autoComplete="email" required /></label>
          <label>Parool<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="button primary wide" type="submit">Logi sisse</button>
        </form>
      </section>
    </main>
  )
}
