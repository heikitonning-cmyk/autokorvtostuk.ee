# Euro Kapital tööäpp

Mobiilikeskne PWA Euro Kapital OÜ autokorvtõstuki tööde juhtimiseks. Avalik `autokorvtostuk.ee` jääb eraldi SEO- ja müügileheks; see rakendus on mõeldud aadressile `app.autokorvtostuk.ee`.

## Mis V1-s töötab

- Supabase email/parool autentimine ja rollid `manager` / `operator`.
- Juhi juhtimispult: tänased tööd, uued tööd, hilinenud alustamata tööd, järeltegevused, käive ja vabad aknad.
- Töö loomine, operaatori määramine ja kinnitamine.
- Kinnitamisel lukustuv hinnasnapshot.
- Operaatori telefonivoog: navigeeri, helista, alusta, töötaimer, foto, märkus, lõpeta, km, lisamees, lisatöö.
- Mitme peatusega töö: salvestatud ja ühekordsed aadressid, duplikaatpeatused, käsitsi järjestamine, peatusepõhine aeg/kirjeldus/märkus/foto ning päeva jooksul peatuste lisamine.
- Marsruudi algus ja lõpp on vaikimisi Luige ning neid saab töö kaupa muuta.
- Waze avab järgmise peatuse navigeerimise; rakendus hoiab marsruudi järjekorda.
- Marsruudi optimeerimine arvutab kiireima ettepaneku ainult kasutaja nupuvajutusel ja ei muuda salvestatud järjekorda enne **Kasuta soovitust** kinnitust.
- Google Routes on valikuline. Kui Google'i võti puudub või Google ei vasta, kasutatakse salvestatud koordinaate/Nominatimi ja OSRM-i; kui ka fallback ei tööta, jäävad käsitsi järjestamine ja Waze alati kasutatavaks.
- Aktiivse töö ajal saab optimeerida ainult tegemata peatuste järjekorda; tehtud, vahele jäetud ja aktiivne peatus jäävad paigale.
- Privaatne fotode salvestus Supabase Storage'is.
- Kliendid, kalender, hinnad ja tööliigid.
- Audit-logi tööde, peatuste paranduste ja hinnaseadete muudatustele.
- PWA manifest ja staatiliste varade offline-kest. Mutatsioone ei järjekorrastata ega näidata offline'is valelikult edukana.

## Supabase

1. Loo Supabase projekt.
2. Käivita SQL Editoris migratsioonid `supabase/migrations/` kaustast kronoloogilises järjekorras.
3. Käivita `supabase/seed.sql`.
4. Loo Authentication > Users alt juhi ja operaatori kasutajad.
5. Lisa nende Auth UUID-d `public.users` tabelisse. Näide:

```sql
insert into public.users (id, name, email, role, active)
values ('AUTH-USER-UUID', 'Juht', 'EMAIL', 'manager', true);
```

Operaatori puhul kasuta rolli `operator`.

6. Project Settings / Connect vaatest kopeeri Project URL ja publishable key.

Lokaalsesse `.env.local` faili:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
GOOGLE_MAPS_ROUTES_API_KEY=
OSRM_BASE_URL=https://router.project-osrm.org
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
ROUTING_USER_AGENT=autokorvtostuk-app/1.0
```

`GOOGLE_MAPS_ROUTES_API_KEY`, `OSRM_BASE_URL`, `NOMINATIM_BASE_URL` ja `ROUTING_USER_AGENT` on serveripoolsed routing-seaded ning neid ei tohi nimetada `NEXT_PUBLIC_...`. Google'i võti on valikuline. Nominatimi tootmiskasutuse identifitseeriv `ROUTING_USER_AGENT` tuleb Cloudflare'is seadistada sobiva rakenduse/kontakti identifikaatoriga; privaatset kontaktandmetega väärtust Git-i ei salvestata.

## Kohalik käivitus

Node 22+:

```bash
npm install
npm test
npm run typecheck
npm run dev
```

Cloudflare'i Workers-runtime buildi kontroll:

```bash
npm run build:cf
```

## Cloudflare Workers / OpenNext

Cloudflare'i deploy tee on seadistatud OpenNext adapteriga. Põhi-Worker on `autokorvtostuk-app`; geokodeerimise Durable Object töötab eraldi Workerina `autokorvtostuk-geocode-throttle`. Põhiäpp kasutab external Durable Object bindingut `GEOCODE_THROTTLE`.

Kasulikud käsud:

```bash
npm run build:cf
npm run preview:cf
npm run deploy:geocode-throttle
npm run deploy:cf
npm run cf-typegen
```

Cloudflare'i keskkonnas tuleb seadistada vähemalt `NEXT_PUBLIC_SUPABASE_URL` ja `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Routing-fallback kasutab `OSRM_BASE_URL`; geocode-throttle kasutab `NOMINATIM_BASE_URL` ja identifitseerivat `ROUTING_USER_AGENT` väärtust. `GOOGLE_MAPS_ROUTES_API_KEY` võib puududa — sellisel juhul on marsruudi ettepaneku arvutus OSRM-i põhine ja kasutajale kuvatakse **Tavapärase sõiduaja järgi** koos OpenStreetMapi omistusega.

`app.autokorvtostuk.ee` ei viida Cloudflare'i peale enne, kui `workers.dev` preview on läbinud autentimise, andmebaasi, viie peatusega OSRM marsruudi, aktiivse töö ja vearežiimi smoke-testid. Senine tootmisdomeen jääb selle kontrollini muutmata.

## Vercel

Verceli seadistus jääb alles varasema/alternatiivse hostingu dokumentatsioonina:

1. Ühenda Vercel GitHubi repoga `heikitonning-cmyk/autokorvtostuk.ee`.
2. Vercel Project Settings > Root Directory: `work-app`.
3. Lisa `NEXT_PUBLIC_SUPABASE_URL` ja `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` Production, Preview ja Development keskkonda.
4. Google Routes kasutamisel lisa `GOOGLE_MAPS_ROUTES_API_KEY` serveripoolse environment variable'ina. Ära kasuta `NEXT_PUBLIC_` prefiksit.
5. Build command: `npm run build`.
6. Domeen on `app.autokorvtostuk.ee`; DNS-i siht tuleb muuta ainult kontrollitud deploy järel.

Kui Google Routes, OSRM või geokodeerimine ei vasta, marsruudi salvestatud järjekorda automaatselt ei muudeta. Kasutaja saab jätkata käsitsi järjestamise ja Waze navigeerimisega.

## Mitme peatusega töö kontroll

1. Loo üks töö ja lisa vähemalt viis salvestatud Neste asukohta; sama jaama võib lisada mitu korda.
2. Muuda peatuste järjekorda käsitsi ja kontrolli, et järjestus salvestub.
3. Vajuta **Optimeeri marsruut**. Enne nupuvajutust ei tohi optimeerimist automaatselt käivitada.
4. Kontrolli, et kuvatakse praeguse ja soovitatud marsruudi aeg/km ning soovitatud peatuste järjekord.
5. **Jäta praegune järjekord** ei tohi andmebaasi järjekorda muuta. **Kasuta soovitust** salvestab ainult ettepaneku peatuste järjekorra.
6. Alusta tööd, märgi üks peatus tehtuks koos märkuse ja vähemalt ühe fotoga ning jäta üks peatus vahele kohustusliku märkusega.
7. Lisa päeva jooksul uus peatus ja vajuta **Optimeeri ülejäänud marsruut**. Tehtud, vahele jäetud ja aktiivset peatust ei tohi ümber tõsta.
8. Kontrolli, et Waze avab järgmise tegemata peatuse aadressi.
9. Peatust **Tehtud** ei saa lõpetada ilma märkuse ja fotota; **Jäta vahele** nõuab märkust, kuid mitte fotot.
10. Kogu töö saab lõpetada alles siis, kui kõik peatused on tehtud või vahele jäetud.

## Esimene kasutuskatse

1. Logi juhina sisse ja lisa klient.
2. Lisa töö, vali aeg, objekt ja hinnakomponendid.
3. Ava töö ning vajuta **Kinnita töö** — siin salvestub hinnasnapshot.
4. Logi operaatorina telefonis sisse, võta töö, ava töö ja vajuta **ALUSTA TÖÖD**.
5. Dokumenteeri töö ning lõpeta see, sisestades tegelikud km.
6. Logi juhina tagasi ning kontrolli tegelikku tööaega, km, fotosid, summat ja staatust.
7. Muuda Seadetes tunnihinda. Varem kinnitatud töö snapshot peab jääma vana hinnaga.

## Oluline turvalisus

Rakenduse ekraanide peitmine ei ole turvameede. Päris piirangud on Supabase Row Level Security reeglites ja guarded RPC-des. Planeerimisandmeid võivad muuta Juht ja Kasutaja vastavalt rakenduse töövoole, kuid peatuse tegeliku teostamise toimingud jäävad määratud kasutaja kontrolli alla. Fotobucket `job-photos` ei ole avalik.
