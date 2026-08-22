# Euro Kapital tööäpp v1 — disain

Kuupäev: 2026-08-22

## Eesmärk

Ehita üks mobiilikeskne tööäpp Euro Kapital OÜ autokorvtõstuki tööde juhtimiseks. Sama rakendus teenindab kahte rolli:

1. **Juht** — näeb kõiki töid, broneeringuid, kalendrit, käivet, operaatori tööpäeva ja tähelepanu vajavaid tegevusi.
2. **Operaator** — näeb ainult talle määratud töid ning saab töö võimalikult väheste vajutustega alustada, dokumenteerida ja lõpetada.

Avalik `autokorvtostuk.ee` jääb SEO- ja müügileheks. Tööäpp elab eraldi rakendusena aadressil `app.autokorvtostuk.ee` ning kasutab sama broneeringuandmestikku, kui avaliku lehe broneerimisvoog hiljem ühendatakse.

## Põhimõtted

- Mobiil enne desktoppi.
- Operaator peab kirjutama nii vähe kui võimalik; eelistatud on suured nupud, valikud, automaatsed ajad, fotod ja telefoniga navigeerimine.
- Hinnad, teenused, tööliigid, operaatorid ja muud äriseaded ei tohi olla koodi sisse kirjutatud.
- Kõik töö olulised muudatused jätavad jälje: kes, millal ja mida muutis.
- Avalikku veebilehte ei muudeta tööäpi tõttu raskeks ega aeglaseks.
- V1 peab olema päriselt kasutatav ühe tõstuki, ühe põhiseadme ja väikese kasutajate arvuga; mitme tõstuki tugi jäetakse andmemudelis võimalikuks, kuid eraldi funktsionaalsusena ei ehitata üle.

## Tehniline arhitektuur

### Frontend

- React/Next.js tüüpi PWA.
- Paigaldatav iPhone'i ja Androidi avakuvale.
- Responsive desktop-vaade juhile.
- PWA manifest, ikoonid ja offline-sõbralik kest.
- Töö kriitilised ekraanid peavad taastuma mõistlikult ka kehva levi korral; kirjutustoimingud ei tohi vaikides kaduma minna.

### Backend

- **Supabase**:
  - PostgreSQL andmebaas;
  - kasutajate autentimine;
  - Row Level Security rollide piiramiseks;
  - fotode failisalvestus;
  - vajadusel serveripoolsed funktsioonid.

### Hosting

- **Vercel** rakenduse jaoks.
- GitHub jääb lähtekoodi ja muudatuste ajaloo keskseks kohaks.
- Avalik olemasolev SEO-leht võib jääda praeguse lahenduse peale; tööäpp ei eelda selle ümberkirjutamist.

## Rollid ja õigused

### Juht

Saab:

- näha kõiki töid ja broneeringuid;
- luua, muuta, kinnitada, ümber tõsta ja tühistada töid;
- määrata operaatori;
- muuta äriseadeid;
- näha kliendi ajalugu;
- näha tööde tegelikku kestust, kilomeetreid ja lisatöid;
- näha käibe- ja töökoormuse kokkuvõtteid;
- näha töö lõpetamise järel puuduvaid tegevusi;
- vajadusel parandada operaatori sisestatud andmeid, jättes muudatuse ajaloo alles.

### Operaator

Saab:

- näha ainult talle määratud tänaseid ja lähiaja töid;
- avada aadressi navigeerimiseks;
- helistada kliendile;
- näha töö kirjeldust, tööliiki, ligipääsuinfot ja märkusi;
- alustada tööd;
- lisada fotosid ja lühimärkusi;
- märkida lisamehe kasutust ja lisatööd;
- lõpetada töö;
- sisestada või kinnitada tegeliku kilometraaži;
- fikseerida kliendi kinnitus.

Operaator ei näe ettevõtte üldist käivet, teiste operaatorite infot ega äriseadeid.

## Põhiekraanid

### 1. Juhi avaleht — „Juhtimispult“

Esimene vaade vastab küsimusele: **mis vajab täna minu tähelepanu?**

Plokid:

- Täna: tööd ajajoones.
- Uued broneeringud, mis ootavad kinnitamist.
- Töö, mis peaks olema alanud, kuid ei ole alustatud.
- Lõpetatud töö, millelt puuduvad vajalikud andmed.
- Järgmise 7 päeva vabad aknad.
- Tänane / nädala / kuu tööde maht ja müügisumma.
- Kiirnupp `+ Lisa töö`.

### 2. Kalender

- Päeva-, nädala- ja kuu vaade.
- Tööd on loetavad ka telefonis ilma horisontaalse kerimiseta.
- Töö kaardil: kellaaeg, klient/objekt, aadress, staatus, operaator.
- Lohistamine ei ole V1 nõue; töö aja muutmine toimub töö detailist.

### 3. Töö detail — juhi vaade

Sektsioonid:

- aeg ja staatus;
- klient ja kontakt;
- objekt ja aadress;
- tööliik ja kirjeldus;
- hinnastamise komponendid;
- operaator;
- töö tegelik algus/lõpp;
- kilometraaž;
- lisamees / lisatöö;
- fotod;
- kliendi kinnitus;
- arveinfo;
- muudatuste ajalugu.

### 4. Operaatori „Täna“

Ülemises osas suur kaart **Järgmine töö**:

- kellaaeg;
- objekt/aadress;
- üks puudutus navigeerimiseks;
- üks puudutus kliendile helistamiseks;
- töö põhikirjeldus;
- suur `ALUSTA TÖÖD` nupp.

Allpool järgmised tööd samal päeval.

### 5. Käimasolev töö

- suur jooksva tööaja näit;
- `Lisa foto`;
- `Lisa märkus`;
- lisamehe lüliti/valik;
- `Lisa lisatöö`;
- `LÕPETA TÖÖ`.

### 6. Töö lõpetamine

Lühike kontroll:

- tegelik lõppaeg automaatselt;
- tegelikud km;
- lisamees: jah/ei + kestus vajadusel;
- lisatöö: jah/ei + kirjeldus;
- fotod olemas / puuduvad;
- kliendi kinnitus;
- arve saaja andmed kontrollitud.

Pärast kinnitamist läheb töö olekusse `tehtud` või `vajab järeltegevust`, kui kohustuslik info on puudu.

### 7. Kliendid

- nimi / ettevõte;
- telefon;
- e-post;
- arveinfo;
- varasemad tööd;
- kogukäive;
- viimane tellimus;
- märkused.

### 8. Seaded

Juht saab ilma koodi muutmata hallata:

- tõstuki tunnihind;
- minimaalne tellimus;
- Tallinna sõiduaja loogika;
- kilomeetrihind;
- lisamehe hind;
- tööliigid;
- hooajalised teenused;
- operaatorid;
- ettevõtte põhiseaded.

## Töö staatused

Põhistaatused:

1. `uus` — broneering või käsitsi sisestatud töö, mida pole kinnitatud;
2. `kinnitatud` — aeg ja töö on kinnitatud;
3. `teel` — valikuline V1 olek operaatori jaoks;
4. `toob` — operaator alustas töö;
5. `tehtud` — töö lõpetatud ja vajalik info olemas;
6. `vajab_jareltegevust` — töö tehtud, kuid midagi vajab juhi sekkumist;
7. `tuhistatud`.

## Andmemudel

### users

- id
- name
- email
- phone
- role (`manager`, `operator`)
- active

### customers

- id
- type (`person`, `company`)
- name
- registry_code
- contact_name
- phone
- email
- billing_address
- notes

### vehicles

- id
- name
- registration_number
- active

V1 kasutab ühte tõstukit, kuid väli väldib hilisemat andmemudeli ümbertegemist.

### jobs

- id
- customer_id
- vehicle_id
- operator_id
- start_planned
- end_planned
- address
- object_name
- work_type_id
- description
- access_notes
- status
- price_snapshot_json
- estimated_total
- actual_start
- actual_end
- actual_km
- helper_used
- helper_hours
- extra_work_description
- actual_total
- invoice_status
- created_by
- created_at
- updated_at

### work_types

- id
- name
- active
- default_notes

Näited: muu töö, katuse hooldus, renni puhastus, jääpurikate eemaldus, lume koristus katuselt, survepesu.

### job_photos

- id
- job_id
- uploaded_by
- storage_path
- category (`before`, `during`, `after`, `issue`)
- created_at

### settings

Võti-väärtus või struktureeritud seadete tabel äriloogika jaoks. Hinnastamisel salvestatakse iga töö juurde **price snapshot**, et hilisem hinnakirja muutmine ei muudaks vana töö ajalugu.

### job_events

Audit-logi:

- job_id
- actor_id
- event_type
- payload
- created_at

## Hinnastamine

V1 ei pea olema raamatupidamistarkvara, kuid töö peab säilitama nii hinnangu kui tegeliku arvestuse.

Hinnakomponendid on eraldi:

- tõstuki tunnid;
- minimaalne tellimus;
- sõiduaeg;
- km;
- lisamehe tunnid;
- kokkulepitud lisatöö;
- käsitsi korrigeerimine koos põhjusega.

Iga kinnitatud töö säilitab kasutatud hindade snapshot'i.

## Broneeringu ühendamine avaliku veebiga

Avaliku veebilehe järgmine broneerimisvoog võib kirjutada sama `jobs` andmestikku staatusega `uus`.

Klient täidab esimesel sammul:

- tööliik;
- kuupäev;
- soovitud kellaaeg;
- eeldatav tööaeg;
- lisameeste arv.

Teisel sammul:

- aadress;
- kaugus/sõidukulu;
- töö detailid;
- kontakt;
- arve saaja;
- kalkuleeritud hind.

Klient näeb hinna muutumist enne kinnitamist. Juht näeb uut tööd kohe Juhtimispuldis ja saab selle kinnitada, muuta või alternatiivse aja pakkuda.

## Teavitused

V1:

- rakendusesisesed hoiatused juhile;
- operaatori tänaste tööde vaade.

Järgmine etapp:

- push-teavitused;
- SMS või e-post kliendile;
- meeldetuletus operaatorile;
- töö lõpetamise järel kliendi automaatne järelkontakt.

Teavituste kanalit ei seota V1-s ühe konkreetse teenusepakkujaga enne, kui põhivoog on kasutuses.

## Offline ja vead

- Lehe kest ja viimati laetud tänased tööd võivad olla loetavad ka ajutise ühenduseta.
- `Alusta tööd` ja `Lõpeta töö` tegevus peab näitama kasutajale selgelt, kas salvestus õnnestus.
- Kui ühendus katkeb, ei tohi rakendus näidata ebaõnnestunud salvestust õnnestununa.
- Fotode üleslaadimine võib ühenduse puudumisel oodata, kuid kasutajale kuvatakse olek.
- Serveripoolsed reeglid kontrollivad, et operaator ei saaks muuta võõrast tööd.

## Turvalisus

- Kõik tööäpi lehed nõuavad sisselogimist.
- Supabase Row Level Security piirab andmeid rolli järgi.
- Operaatori õigused on minimaalsed.
- Kliendi andmeid ei hoita brauseri püsivas vabateksti-cache'is rohkem kui funktsionaalselt vajalik.
- Fotode ligipääs ei ole avalik.
- Admin/seadete muutused logitakse.

## V1 teadlikult välja jäetud

- täisraamatupidamine ja e-arvete saatmine;
- palgaarvestus;
- täismahus GPS fleet tracking;
- App Store / Google Play native rakendus;
- keeruline teekonnaoptimeerimine;
- automaatne AI-hinnastamine;
- mitme tõstuki dispetšerloogika;
- kliendi eraldi konto/portaal.

Need võivad tulla pärast seda, kui põhivoog on päris tööpäeval läbi proovitud.

## AI-kiht järgmises etapis

Kui põhiandmed on usaldusväärsed, lisatakse juhile AI-assistent, mis oskab vastata näiteks:

- Mis vajab täna minu tähelepanu?
- Millised tööd on lõpetatud, aga arveinfo puudub?
- Kus on järgmise 7 päeva vabad aknad?
- Millised kliendid pole 6 kuud tellinud?
- Milline tööliik annab kõige rohkem käivet töötunni kohta?
- Millistel töödel läks tegelik aeg hinnangust oluliselt üle?

AI ei tohi V1-s olla põhivoo eeltingimus; süsteem peab töötama ka ilma AI-ta.

## Testimine ja vastuvõtukriteeriumid

V1 on kasutuskõlblik, kui järgmine rada töötab telefonis otsast lõpuni:

1. juht loob töö;
2. määrab operaatori;
3. operaator näeb tööd oma tänases vaates;
4. operaator avab navigeerimise ja kliendi telefonikõne;
5. operaator alustab töö;
6. lisab foto;
7. lõpetab töö ja sisestab tegelikud km;
8. juht näeb lõpetatud töö tegelikku aega, km, fotosid ja staatust;
9. juht muudab hinnaseadet ning vana töö hinnalugu ei muutu;
10. operaator ei saa avada ega muuta talle mitte määratud tööd.

Automaatkontrollid peavad katma vähemalt:

- rollipõhised õigused;
- töö staatuste lubatud üleminekud;
- hinnasnapshot'i säilimise;
- hinnakomponentide arvutuse;
- kohustuslike väljade valideerimise;
- mobiilse põhivoo kriitilised kasutajateed.

## Esimese väljalaske soovitatud järjestus

1. autentimine ja rollid;
2. andmebaasi skeem ja turvareeglid;
3. juhi `Lisa töö` + tööde nimekiri;
4. operaatori `Täna`;
5. töö alustamine/lõpetamine;
6. fotod ja km;
7. kalender;
8. kliendid;
9. seaded ja hinnasnapshot;
10. juhtimispuldi hoiatused ja põhinäitajad;
11. PWA paigaldus ja mobiilikasutuse viimistlus.

## Edu mõõdik

Rakendus on edukas siis, kui ühe tavalise töö puhul ei ole vaja töö andmeid pärast päeva lõppu eraldi WhatsAppist, telefonikõnest või paberilt kokku korjata: broneering, aeg, klient, töö käik, fotod, tegelik kestus, km ja lisatööd on ühe töö kirje juures olemas.