import { InviteLinkForm } from '@/components/InviteLinkForm'
import { getUsersAndInvites } from '@/lib/users'
import { revokeWorkerInvite } from './actions'

function dateTime(value: string) {
  return new Intl.DateTimeFormat('et-EE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Tallinn' }).format(new Date(value))
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ users, invites }, params] = await Promise.all([getUsersAndInvites(), searchParams])
  const errorText = Array.isArray(params.error) ? params.error[0] : params.error
  const now = Date.now()

  return <div className="page stack-lg">
    <div><p className="eyebrow">Juht</p><h1>Kasutajad</h1><p className="muted">Töömehed loovad konto ainult sinu kutselingi kaudu.</p></div>
    {params.revoked && <div className="alert success">Kutse tühistati.</div>}
    {errorText && <div className="alert danger">{errorText}</div>}

    <InviteLinkForm />

    <section>
      <div className="section-title"><h2>Kasutajad</h2><span className="count">{users.length}</span></div>
      <div className="customer-grid">{users.map((user: any) => <div className="customer-card" key={user.id}>
        <div><strong>{user.name || user.email}</strong><small>{user.email}</small></div>
        <div className="job-meta"><span>{user.role === 'manager' ? 'Juht' : 'Kasutaja'}</span><span>{user.active ? 'Aktiivne' : 'Mitteaktiivne'}</span></div>
        {user.phone && <small>{user.phone}</small>}
      </div>)}</div>
    </section>

    <section>
      <div className="section-title"><h2>Viimased kutsed</h2><span className="count">{invites.length}</span></div>
      <div className="stack">{invites.length ? invites.map((invite: any) => {
        const expired = new Date(invite.expires_at).getTime() <= now
        const active = !invite.used_at && !invite.revoked_at && !expired
        const status = invite.used_at ? 'Kasutatud' : invite.revoked_at ? 'Tühistatud' : expired ? 'Aegunud' : 'Aktiivne'
        return <div className="detail-card" key={invite.id}>
          <div className="page-title-row"><div><strong>{status}</strong><p className="muted">Loodud {dateTime(invite.created_at)} · kehtib kuni {dateTime(invite.expires_at)}</p></div>{active && <form action={revokeWorkerInvite}><input type="hidden" name="id" value={invite.id} /><button className="button danger-outline" type="submit">Tühista kutse</button></form>}</div>
        </div>
      }) : <div className="empty">Kutseid veel ei ole.</div>}</div>
    </section>
  </div>
}
