# Euro Kapital tööäpp

Mobiilikeskne PWA Euro Kapital OÜ autokorvtõstuki tööde juhtimiseks. Avalik `autokorvtostuk.ee` jääb eraldi SEO- ja müügileheks; see rakendus on mõeldud aadressile `app.autokorvtostuk.ee`.

## Mis V1-s töötab

- Supabase email/parool autentimine ja rollid `manager` / `operator`.
- Juhi juhtimispult: tänased tööd, uued tööd, hilinenud alustamata tööd, järeltegevused, käive ja vabad aknad.
- Töö loomine, operaatori määramine ja kinnitamine.
- Kinnitamisel lukustuv hinnasnapshot.
- Operaatori telefonivoog: navigeeri, helista, alusta, töötaimer, foto, märkus, lõpeta, km, lisamees, lisatöö.
- Privaatne fotode salvestus Supabase Storage'is.
- Kliendid, kalender, hinnad ja tööliigid.
- Audit-logi tööde ja hinnaseadete muudatustele.
- PWA manifest ja staatiliste varade offline-kest. Mutatsioone ei järjekorrastata ega näidata offline'is valelikult edukana.

## Supabase

1. Loo Supabase projekt.
2. Käivita SQL Editoris `supabase/migrations/20260822190000_init.sql`.
3. Käivita `supabase/seed.sql`.
4. Loo Authentication > Users alt juhi ja operaatori kasutajad.
5. Lisa nende Auth UUID-d `public.users` tabelisse. Esimese juhi näide:

```sql
insert into public.users (id, name, email, role, active)
values ('AUTH-USER-UUID', 'Heiki', 'EMAIL', 'manager', true);
```

Operaatori puhul kasuta rolli `operator`.

6. Project Settings / Connect vaatest kopeeri Project URL ja publishable key.

Lokaalsesse `.env.local` faili:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

## Kohalik käivitus

Node 22+:

```bash
npm install
npm test
npm run typecheck
npm run dev
```

## Vercel

1. Ühenda Vercel GitHubi repoga `heikitonning-cmyk/autokorvtostuk.ee`.
2. Vercel Project Settings > Root Directory: `work-app`.
3. Lisa samad kaks Supabase environment variable'it Production, Preview ja Development keskkonda.
4. Build command: `npm run build` (Next.js auto-detect sobib samuti).
5. Lisa domeen `app.autokorvtostuk.ee`.
6. Zone DNS-is lisa Verceli poolt näidatud CNAME/A kirje. Kasuta täpselt Verceli antud väärtust, mitte juhuslikku näidis-IP-d.

## Esimene kasutuskatse

1. Logi juhina sisse ja lisa klient.
2. Lisa töö, vali operaator, aeg, objekt ja hinnakomponendid.
3. Ava töö ning vajuta **Kinnita töö** — siin salvestub hinnasnapshot.
4. Logi operaatorina telefonis sisse, ava **Täna**, ava töö ja vajuta **ALUSTA TÖÖD**.
5. Lisa foto ja lõpeta töö, sisestades tegelikud km.
6. Logi juhina tagasi ning kontrolli tegelikku tööaega, km, fotot, summat ja staatust.
7. Muuda Seadetes tunnihinda. Varem kinnitatud töö snapshot peab jääma vana hinnaga.

## Oluline turvalisus

Rakenduse ekraanide peitmine ei ole turvameede. Päris piirangud on Supabase Row Level Security reeglites. Operaator saab andmebaasi tasandil lugeda ja muuta ainult talle määratud töid ning nende fotosid. Fotobucket `job-photos` ei ole avalik.
