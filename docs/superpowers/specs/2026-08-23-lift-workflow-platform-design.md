# Autokorvtõstuki terviklik töövooplatvorm – disain

Kuupäev: 2026-08-23
Branch: `app-v1-build`

## Eesmärk

Arendada olemasolev Euro Kapitali tööäpp terviklikuks autokorvtõstuki töövoosüsteemiks, mis ühendab:

1. kodulehe päringud ja broneeringud;
2. kliendid ning kliendi püsivad objektid/asukohad;
3. ühe tõstuki ühise tööplaani;
4. tööpäevad ja mitme peatusega marsruudid;
5. töömeeste mobiilse töövoo;
6. arve aluse ja palgaarvestuse;
7. Neste olemasoleva hoolduskava loogika.

Süsteem peab säilitama praeguse tööäpi töökindluse ning lubama uued osad kasutusele võtta etapiviisiliselt.

## Lähteolukord

Praeguses äpis on juba:

- Supabase Auth ja rollid `manager` / `operator`;
- Juht/Kasutaja vaade;
- kliendid;
- tööd;
- ühe tõstuki ühine tööplaan;
- kasutaja võimalus vaba töö endale võtta;
- töö muutmine;
- kuupäev/kellaaeg;
- töö staatused;
- fotod;
- hinnastuse snapshot kinnitamisel;
- töö muudatuste audit;
- PWA.

Neste Google Sheetsi tööfailis on olemas järgmine äriloogika, mis tuleb säilitada:

- üks tööpäev võib sisaldada mitut tanklat;
- päeva esimesel real on kuupäev, tõstuki kasutus, kohal olnud inimesed, Luige–Luige tööaeg, maantee km ja tõstuki arvetunnid;
- järgmised read on sama päeva järgmised tanklad;
- arve aluseks eristatakse tõstuki aega, km, töömehetunde ja töömehe sõiduaega;
- palgaarvestuses saavad valitud töötajad kogu päeva tööaja;
- marsruudiplaneerimises on piirkond, peatuste järjekord, km, sõiduaeg, tööaeg ja päeva kogupikkus;
- algandmetes on 59 Neste jaama nime ja aadressiga ning täiendava hooldusinfoga.

## Põhiarhitektuur

Süsteemi keskne mudel muutub järgmiseks:

`Klient -> Asukoht/objekt -> Päring -> Töö -> Tööpäev -> Marsruudi peatus -> Töö teostus -> Arve/Palk`

Kõik osad elavad samas Supabase projektis ja olemasolevas Next.js tööäpis. Avalik autokorvtostuk.ee jääb müügi- ja broneerimisleheks ning saadab päringu turvalise serveripoolse API kaudu tööäppi.

## Etappide järjekord

### Etapp 1 – Klient ja asukohad

See etapp tehakse esimesena, sest kõik ülejäänud osad sõltuvad sellest.

#### Uus tabel `customer_sites`

Väljad:

- `id uuid pk`
- `customer_id uuid -> customers.id`
- `name text not null`
- `external_code text null`
- `address text null`
- `city text null`
- `county text null`
- `latitude numeric null`
- `longitude numeric null`
- `requires_lift boolean null`
- `service_notes text null`
- `active boolean default true`
- `source text null` – nt `manual`, `neste_import`, `website`
- `source_ref text null`
- `created_at`, `updated_at`

Unikaalsus: kliendi piires ei tohi sama `external_code` korduda, kui see on määratud.

#### Tööd

`jobs` saab väljad:

- `site_id uuid null -> customer_sites.id`
- `inbound_request_id uuid null`
- `work_day_id uuid null` ei lisata otse; seos tehakse join-tabeliga hiljem, et töö saaks vajadusel ümber planeerida.

Töö aadress jääb jobs tabelisse snapshot-väljana. Kui töö valitakse kliendi objektilt, kopeeritakse hetke aadress tööle. Hilisem objekti aadressi muutmine ei muuda ajaloolise töö aadressi.

#### UI

Töö loomisel ja muutmisel:

1. valitakse `Klient`;
2. kui kliendil on objektid, tekib `Asukoht / objekt` valik;
3. asukoha valimisel täituvad objekti nimi ja aadress;
4. saab valida `+ Lisa uus asukoht`;
5. uus asukoht jääb kliendi juurde püsivalt.

Kui kliendil objekte ei ole, töötab vorm täpselt nagu praegu.

#### Neste import

Luua või leida klient `Neste Eesti AS` / kasutaja kinnitatud täpse nimega.

Importida olemasolevast Neste algandmest 59 jaama:

- `Tankla` -> `customer_sites.name`
- `Aadress` -> `customer_sites.address`
- `Nr` -> `external_code` kujul `NESTE-001` ... `NESTE-059`
- `tõstuki vajadus` -> `requires_lift`
- puude/töö märkused -> `service_notes`
- source = `neste_import`

Import peab olema idempotentne: korduv käivitus uuendab sama `external_code` objekti, mitte ei tekita duplikaati.

Neste puhul muutub töö lisamine praktiliselt:

`Klient = Neste -> Asukoht = Pirita -> aadress = Rummu tee 2, Tallinn`

### Etapp 2 – Kodulehe päring automaatselt äppi

#### Uus tabel `inbound_requests`

Väljad:

- `id uuid pk`
- `source text` – `website`
- `status text` – `new`, `accepted`, `alternative_proposed`, `declined`, `converted`
- kliendi nimi / ettevõte / e-post / telefon;
- soovitud kuupäev;
- soovitud kellaaeg;
- tööliik;
- aadress;
- objekti/lühinimi;
- kirjeldus;
- hinnakalkulaatori sisendid;
- kalkuleeritud hind;
- raw payload jsonb;
- spam/rate-limit metadata;
- `job_id uuid null` pärast tööks muutmist;
- timestamps.

#### Avalik API

Staatiline koduleht ei saa omada Supabase service-role võtit.

Seetõttu teeb koduleht POST päringu serveripoolsesse endpointi tööäpi/Verceli domeenis, näiteks:

`POST https://app.autokorvtostuk.ee/api/public/booking-request`

Endpoint:

- valideerib sisendi;
- rakendab rate limit / honeypot kaitset;
- lubab ainult väljade whitelist'i;
- sisestab `inbound_requests` rea serveripoolse võtmega;
- ei luba avalikul kasutajal lugeda ega muuta andmebaasi;
- tagastab kliendile päringu ID ja kinnituse, et soov on vastu võetud, mitte lõplikult kinnitatud.

#### Juhi töövoog

Juhtimispuldile tekib `Uued päringud`.

Päringu juures:

- `Kinnita`;
- `Muuda`;
- `Paku teine aeg`;
- `Keeldu`.

`Kinnita` loob/uuendab kliendi, vajadusel asukoha ja loob `jobs` rea. Päringu status muutub `converted`.

Duplikaadikaitse: sama päringut ei saa kaks korda tööks muuta.

### Etapp 3 – Tööpäev ja marsruut

Ühe tõstuki puhul ei planeerita inimesepõhist kalendrit, vaid tõstuki tööpäeva.

#### Uus tabel `work_days`

- `id uuid pk`
- `work_date date`
- `vehicle_id uuid`
- `status` – `planning`, `ready`, `active`, `done`, `cancelled`
- `base_start_address` – vaikimisi Luige
- `base_end_address` – vaikimisi Luige
- `planned_start_time`
- `planned_end_time`
- `actual_start`, `actual_end`
- `planned_distance_km`
- `actual_distance_km`
- `planned_drive_minutes`
- `planned_work_minutes`
- `lift_invoice_hours`
- `notes`
- route provider metadata/json;
- timestamps.

#### Uus tabel `work_day_jobs`

- `work_day_id`
- `job_id`
- `sequence integer`
- `planned_arrival`
- `planned_departure`
- `actual_arrival`
- `actual_departure`
- `route_leg_distance_km`
- `route_leg_duration_minutes`
- primary key `(work_day_id, job_id)`
- unique `(work_day_id, sequence)`.

Üks töö saab korraga kuuluda ainult ühte aktiivsesse tööpäeva.

#### Kaardiplaneerija

Soovitus: Google Maps / Routes API planeerimiseks, Waze link tegelikuks navigeerimiseks.

Põhjus:

- vaja on 4–10 peatusega päevade marsruuti;
- vaja on peatuste ümberjärjestamist;
- vaja on realistlikku sõiduaega ja km;
- Neste saarte töödel peab provider arvestama praamide/teede tegelikku marsruuti paremini kui lihtne sirgjooneline/open-source lähendus.

Kaardivaates:

- vasakul / mobiilis all tööde nimekiri;
- kaardil kõik valitud tööd;
- drag-and-drop järjekord;
- `Optimeeri järjekord`;
- `Lisa töö päeva`;
- `Eemalda päevast`;
- kokku km;
- kokku sõiduaeg;
- hinnanguline tööaeg;
- päeva kogupikkus;
- hoiatus, kui päev ületab näiteks 10–12 h sihti.

Marsruut algab ja lõpeb vaikimisi Luigel. Seda saab tööpäeva kaupa muuta.

Neste olemasolev `Marsruudid` loogika muutub rakenduse planeerimisvaateks, mitte käsitsi peetavaks tabeliks.

### Etapp 4 – Tööpäeva inimesed ja teostus

#### Uus tabel `work_day_users`

- `work_day_id`
- `user_id`
- `role_on_day` – `driver_operator`, `worker`
- `worked_hours` / arvutatud tegelikust päevast, vajadusel manager override;
- `hourly_cost_snapshot`;
- timestamps.

Juhi nime käsitsi Neste-laadses sisestuses ei nõuta. Kui tõstuk on kasutusel, peab tööpäeval olema vähemalt üks kasutaja, kes saab operaatori/juhi rolli.

#### Kasutaja mobiilivaade

Kasutaja näeb tööpäeva ühtse marsruudina:

- päeva algus;
- peatuste järjekord;
- järgmine objekt;
- Waze `Navigeeri`;
- `Saabusin`;
- `Alusta`;
- foto/märkus;
- `Valmis`;
- järgmine peatus;
- päeva lõpetamine.

Töö omanik ei määra kalendri nähtavust. Kõik kasutajad näevad ühe tõstuki tööplaani nagu praegu kokku lepitud.

### Etapp 5 – Arve alus ja palk

Säilitada Neste tööfaili äriloogika, kuid arvutada see andmebaasist.

#### Kliendipõhine hinnastus

Lisada kliendile või kliendilepingule hinnareeglid. Üldhinnakiri jääb fallbackiks.

Neste jaoks saab salvestada oma hinnasnapshotid, nt olemasolevast failist:

- tõstuki tund koos juhiga;
- tõstuki maantee km;
- töömehe sõiduaeg;
- töömehe tund.

Tööpäeva lõpus arvutatakse:

- tõstuki arvetunnid;
- km;
- lisatöömehe tunnid;
- töömehe sõiduaeg;
- vajadusel käsikorrektsioon.

#### Arve alus

Äpis tekib perioodi/kliendi järgi arve aluse vaade ja export CSV/XLSX/PDF vajaduse järgi.

Neste puhul peab tulemus olema võrreldav olemasoleva `Arve alus` lehega enne Exceli kasutusest eemaldamist.

#### Palgaarvestus

Palgaarvestuse aluseks on `work_day_users` ja tegelik tööpäeva aeg. Töötaja tunnihind snapshotitakse päevale, et hilisem palgamuutus minevikku ei muudaks.

## Õigused

### Juht

- kõik kliendid ja asukohad;
- kõik päringud;
- kõik tööd;
- tööpäevad ja marsruudid;
- hinnastus;
- arve/palk;
- kasutajad.

### Kasutaja

- näeb ühe tõstuki kõiki tühistamata töid;
- saab muuta kõiki lõpetamata/tühistamata töid vastavalt praegusele kokkuleppele;
- saab võtta vaba töö;
- näeb tööpäeva marsruuti;
- saab teostada enda võetud töö tegevusi;
- ei saa muuta üldist hinnakirja, kasutajaid ega palgamäärasid;
- ei saa muuta lõpetatud/tühistatud töö finantsajalugu.

### Avalik veeb

- saab ainult esitada uue päringu läbi public API;
- ei saa andmeid lugeda;
- ei saa töid muuta;
- ei saa kasutada manager/operator RPC-sid.

## Audit ja ajaloolisus

- olemasolev `job_events` audit säilib;
- lisada audit vajadusel customer_sites, inbound_requests ja work_days kriitilistele muudatustele;
- hinnad snapshotitakse;
- töö aadress snapshotitakse tööle;
- töötaja palgahind snapshotitakse tööpäevale;
- marsruudi lõplik planeeritud variant säilitatakse tööpäeval.

## Migratsioon ja tagasiühilduvus

1. Uued tabelid lisatakse ilma olemasolevaid jobs kirjeid rikkumata.
2. `site_id` on nullable.
3. Vanad tööd töötavad ilma asukohata.
4. Neste import ei muuda olemasolevaid töid automaatselt.
5. Olemasolev ühine tõstuki tööplaan jääb toimima kogu ülemineku ajal.
6. Marsruudiplaneerija kasutuselevõtt ei muuda töö enda staatuseloogikat.
7. Excelit ei eemaldada enne, kui äpi arve- ja palgaarvestus on vähemalt ühe tegeliku Neste perioodiga võrreldud.

## Testimisstrateegia

Kõik etapid test-first.

### Etapp 1

- customer_sites schema/RLS;
- sama kliendi objektide lugemine;
- kasutaja saab valida Neste asukoha;
- aadress snapshotitakse tööle;
- import 59 objekti;
- import on idempotentne;
- käsitsi uus objekt jääb kliendi alla.

### Etapp 2

- public API lubab ainult POST;
- sisendvalideerimine;
- rate-limit/honeypot;
- päring tekib appi;
- convert on atomaarne/idempotentne;
- avalik kasutaja ei saa päringuid lugeda.

### Etapp 3

- töö saab kuuluda ühte aktiivsesse tööpäeva;
- sequence unikaalne;
- tühistatud töö ei mõjuta marsruuti;
- route totals;
- optimeeritud järjekord salvestub;
- vabad aknad arvestavad tööpäeva/töö tegelikku hõivatust korrektselt.

### Etapp 4

- kasutaja tööpäeva õigused;
- saab märkida saabumise/alustamise/lõpetamise;
- teise kasutaja tööd ei saa alustada ilma claimita;
- kogu tööpäeva aeg salvestub.

### Etapp 5

- Neste arvestusnäited reproduktsioonitestidena;
- tõstuk + km + töömehed;
- päeva esimese rea loogika ei tekita duplikaatarvestust;
- palgatunnid kõigile tööpäeval osalenutele;
- hinnasnapshot ei muutu hilisema seadistuse muutusega.

## Rakendamise jaotus

### Release A – kliendi objektid

- migrations `customer_sites` + `jobs.site_id`;
- RLS;
- klientide detailis objektide haldus;
- töö loomise/muutmise sõltuv Klient -> Objekt valik;
- Neste 59 jaama import;
- deploy.

### Release B – veebipäringud

- inbound_requests;
- public API;
- public website booking POST;
- juhtimispuldi päringukaart;
- convert-to-job;
- deploy.

### Release C – tööpäev + kaart

- work_days;
- work_day_jobs;
- kaart;
- route provider adapter;
- optimeerimine;
- Luige start/end;
- Waze next-stop links;
- deploy.

### Release D – tööpäeva inimesed

- work_day_users;
- mobiilne marsruudivaade;
- actual päev / peatused;
- deploy.

### Release E – arve ja palk

- kliendipõhine hinnastus;
- arve alus;
- palgaarvestus;
- Neste Excel comparison;
- export;
- deploy.

## Esimese release'i valmisoleku kriteeriumid

Release A loetakse valmis, kui:

1. Neste klient on äpis;
2. tema all on 59 unikaalset tanklat;
3. töö lisamisel `Neste -> Pirita` täidab aadressi `Rummu tee 2, Tallinn`;
4. `+ Lisa uus asukoht` töötab;
5. sama funktsioon töötab ka teiste klientidega;
6. olemasolevad tööd ja kasutajavaade töötavad edasi;
7. RLS-testid, unit-testid, typecheck ja build on rohelised;
8. migration on live Supabase'is rakendatud;
9. Verceli deploy on success.

## Disainiotsused, mida ei lükata järgmisse etappi

- klient ja objekt on eraldi olemid;
- ühe tõstuki kalender on ühine;
- Neste mitme tankla päev modelleeritakse hiljem `work_day` + mitu tööd, mitte ühe hiigeltööna;
- avalik koduleht ei saa service-role võtit;
- tööle jääb aadressi snapshot;
- route provider peidetakse adapteri taha, et Google Mapsi saaks vajadusel hiljem vahetada;
- Excel jääb ülemineku kontrollvahendiks, mitte süsteemi põhiallikaks.
