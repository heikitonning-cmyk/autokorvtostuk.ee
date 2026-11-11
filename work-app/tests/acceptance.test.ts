import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

test('v1 contains the critical manager and operator routes', () => {
  for (const path of [
    'src/app/manager/page.tsx',
    'src/app/manager/jobs/new/page.tsx',
    'src/app/manager/jobs/[id]/edit/page.tsx',
    'src/app/manager/calendar/page.tsx',
    'src/app/manager/customers/page.tsx',
    'src/app/manager/settings/page.tsx',
    'src/app/manager/users/page.tsx',
    'src/app/operator/page.tsx',
    'src/app/operator/calendar/page.tsx',
    'src/app/operator/jobs/[id]/page.tsx',
    'src/app/operator/jobs/[id]/edit/page.tsx',
    'src/app/operator/jobs/[id]/finish/page.tsx',
    'src/app/register/[token]/page.tsx',
  ]) assert.equal(existsSync(resolve(root, path)), true, path)
})

test('new and edit routes use compact payroll-driver dispatch', () => {
  const page = readFileSync(resolve(root, 'src/app/manager/jobs/new/page.tsx'), 'utf8')
  const form = readFileSync(resolve(root, 'src/components/SimpleJobForm.tsx'), 'utf8')
  assert.match(page, /SimpleJobForm/)
  assert.match(form, /name="date" type="date"/)
  assert.match(form, /name="time" type="time"/)
  assert.match(form, /name="driver"/)
  assert.doesNotMatch(form, /operatorId|JobPricingFields|JobStopsEditor/)
})

test('only manager edits the compact work form; old driver edit and finish links redirect', () => {
  const managerEdit = readFileSync(resolve(root, 'src/app/manager/jobs/[id]/edit/page.tsx'), 'utf8')
  assert.match(managerEdit, /requireUser\('manager'\)/)
  assert.match(managerEdit, /SimpleJobForm/)
  for (const route of ['edit','finish']) {
    const page = readFileSync(resolve(root, `src/app/operator/jobs/[id]/${route}/page.tsx`), 'utf8')
    assert.match(page, /redirect/)
    assert.doesNotMatch(page, /JobEditForm|PhotoUploader|finishJob/)
  }
})

test('job reference data includes customer sites', () => {
  const queries = readFileSync(resolve(root, 'src/lib/queries.ts'), 'utf8')
  assert.match(queries, /customer_sites/)
  assert.match(queries, /sites:/)
  assert.match(queries, /site:customer_sites/)
})

test('compact form offers manual address and hides the optional address book', () => {
  const form = readFileSync(resolve(root, 'src/components/SimpleJobForm.tsx'), 'utf8')
  assert.match(form, /name="address"/)
  assert.match(form, /<details className="simple-address-picker">/)
  assert.match(form, /Näita ka Neste aadresse/)
  assert.match(form, /visibleDispatchSites/)
})

test('address can be chosen from customer sites while remaining manually editable', () => {
  const component = readFileSync(resolve(root, 'src/components/JobLocationFields.tsx'), 'utf8')
  assert.match(component, /name="addressSiteId"/)
  assert.match(component, /Muu aadress/)
  assert.match(component, /name="address"/)
  assert.match(component, /changeAddressSite/)
  assert.match(component, /site\.address/)
})

test('both detail routes share navigation and contact without driver workflow controls', () => {
  const details = readFileSync(resolve(root, 'src/components/SimpleJobDetails.tsx'), 'utf8')
  assert.match(details, /JobContactActions/)
  assert.match(details, /jobPhoneHref/)
  assert.match(details, /wazeUrl/)
  for (const role of ['manager','operator']) {
    const page = readFileSync(resolve(root, `src/app/${role}/jobs/[id]/page.tsx`), 'utf8')
    assert.match(page, /SimpleJobDetails/)
  }
})

test('customer CRM lists and adds saved locations', () => {
  const page = readFileSync(resolve(root, 'src/app/manager/customers/page.tsx'), 'utf8')
  const actions = readFileSync(resolve(root, 'src/app/manager/customers/actions.ts'), 'utf8')
  const queries = readFileSync(resolve(root, 'src/lib/queries.ts'), 'utf8')
  assert.match(page, /Asukohad/)
  assert.match(page, /\+ Lisa asukoht/)
  assert.match(page, /customer_sites/)
  assert.match(actions, /createCustomerSite/)
  assert.match(actions, /source:\s*'manual'/)
  assert.match(queries, /customer_sites\(id,name,address,active,requires_lift,source\)/)
})

test('driver work plan exposes contact actions and details, without edits or timers', () => {
  const page = readFileSync(resolve(root, 'src/app/operator/page.tsx'), 'utf8')
  const details = readFileSync(resolve(root, 'src/app/operator/jobs/[id]/page.tsx'), 'utf8')
  assert.match(page, /JobContactActions/)
  assert.match(page, /driver_name/)
  assert.doesNotMatch(page + details, /\/edit|startJob|finishJob|PhotoUploader|MarkJobCompleted|ElapsedTimer/)
})

test('worker job controls use manager assignment instead of self-service', () => {
  const card = readFileSync(resolve(root, 'src/components/OperatorJobCard.tsx'), 'utf8')
  assert.doesNotMatch(card, /VÕTA TÖÖ/)
  assert.doesNotMatch(card, /Vabasta töö/)
})

test('worker landing page shows the shared work plan and its history', () => {
  const page = readFileSync(resolve(root, 'src/app/operator/page.tsx'), 'utf8')
  const shell = readFileSync(resolve(root, 'src/components/AppShell.tsx'), 'utf8')
  const oldCalendar = readFileSync(resolve(root, 'src/app/operator/calendar/page.tsx'), 'utf8')
  assert.match(page, /getSharedLiftCalendar/)
  assert.match(page, /Varasemad tööd/)
  assert.match(page, /Tööplaan/)
  assert.doesNotMatch(page, /VÕTA TÖÖ/)
  assert.doesNotMatch(shell, /href="\/operator\/calendar"/)
  assert.match(oldCalendar, /redirect\(['"]\/operator\?view=calendar['"]\)/)
})

test('multi-stop editor supports search, many selected sites and mobile reorder', () => {
  const picker = readFileSync(resolve(root, 'src/components/StopPicker.tsx'), 'utf8')
  const order = readFileSync(resolve(root, 'src/components/StopOrderEditor.tsx'), 'utf8')
  assert.match(picker, /Otsi nime, aadressi või linna/)
  assert.match(picker, /Valitud/)
  assert.match(picker, /Lisa .* peatust tööle/)
  assert.match(picker, /type="checkbox"/)
  assert.match(order, /DndContext/)
  assert.match(order, /SortableContext/)
})

test('stop picker can add a one-off address and reorder selected drafts before saving', () => {
  const picker = readFileSync(resolve(root, 'src/components/StopPicker.tsx'), 'utf8')
  assert.match(picker, /\+ Lisa muu aadress/)
  assert.match(picker, /manualAddress/)
  assert.match(picker, /Valitud/)
  assert.match(picker, /arrayMove|SortableContext/)
})

test('manager and worker edit flows expose shared multi-stop planning actions', () => {
  const actions = readFileSync(resolve(root, 'src/app/job-stop-actions.ts'), 'utf8')
  const managerActions = readFileSync(resolve(root, 'src/app/manager/jobs/actions.ts'), 'utf8')
  assert.match(actions, /add_job_stops/)
  assert.match(actions, /reorder_job_stops/)
  assert.match(actions, /update_job_route_endpoints/)
  assert.match(managerActions, /initialStopsJson/)
  assert.match(managerActions, /add_job_stops/)
  const form = readFileSync(resolve(root, 'src/components/JobEditForm.tsx'), 'utf8')
  assert.match(form, /JobStopsEditor/)
})

test('operator stop flow requires note and stop photo for done but not skip', () => {
  const card = readFileSync(resolve(root, 'src/components/ActiveStopCard.tsx'), 'utf8')
  const actions = readFileSync(resolve(root, 'src/app/operator/jobs/actions.ts'), 'utf8')
  const uploader = readFileSync(resolve(root, 'src/components/PhotoUploader.tsx'), 'utf8')
  assert.match(card, /Alusta peatust/)
  assert.match(card, /Tehtud/)
  assert.match(card, /Jäta vahele/)
  assert.match(card, /completionNote/)
  assert.match(actions, /start_job_stop/)
  assert.match(actions, /complete_job_stop/)
  assert.match(actions, /skip_job_stop/)
  assert.match(uploader, /jobStopId/)
})

test('multi-stop job finish is blocked until all stops are resolved without breaking legacy jobs', () => {
  const actions = readFileSync(resolve(root, 'src/app/operator/jobs/actions.ts'), 'utf8')
  assert.match(actions, /job_stops/)
  assert.match(actions, /pending/)
  assert.match(actions, /in_progress/)
  assert.match(actions, /count/)
})

test('PWA manifest and service worker exist', () => {
  assert.equal(existsSync(resolve(root, 'src/app/manifest.ts')), true)
  assert.equal(existsSync(resolve(root, 'public/sw.js')), true)
  assert.equal(existsSync(resolve(root, 'public/icon.svg')), true)
})

test('service worker never queues or fakes mutation success', () => {
  const sw = readFileSync(resolve(root, 'public/sw.js'), 'utf8')
  assert.match(sw, /request\.method !== 'GET'/)
  assert.doesNotMatch(sw, /POST.*cache\.put/is)
})

test('deployment instructions include Supabase, Vercel and app subdomain', () => {
  const readme = readFileSync(resolve(root, 'README.md'), 'utf8')
  assert.match(readme, /Supabase/i)
  assert.match(readme, /Vercel/i)
  assert.match(readme, /app\.autokorvtostuk\.ee/i)
})

test('Cloudflare OpenNext deployment is explicitly configured', () => {
  const pkg = readFileSync(resolve(root, 'package.json'), 'utf8')
  assert.match(pkg, /@opennextjs\/cloudflare/)
  assert.match(pkg, /opennextjs-cloudflare build/)
  assert.equal(existsSync(resolve(root, 'wrangler.jsonc')), true)
  assert.equal(existsSync(resolve(root, 'open-next.config.ts')), true)
  const wrangler = readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8')
  const openNext = readFileSync(resolve(root, 'open-next.config.ts'), 'utf8')
  const envExample = readFileSync(resolve(root, '.env.example'), 'utf8')
  assert.match(wrangler, /\.open-next\/worker\.js/)
  assert.match(wrangler, /nodejs_compat/)
  assert.match(wrangler, /GEOCODE_THROTTLE/)
  assert.match(wrangler, /autokorvtostuk-geocode-throttle/)
  assert.match(openNext, /defineCloudflareConfig/)
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_.*ROUT/)
})

test('manager detail omits redundant confirmation and completion controls', () => {
  const page = readFileSync(resolve(root, 'src/app/manager/jobs/[id]/page.tsx'), 'utf8')
  assert.doesNotMatch(page, /confirmJob|MarkJobCompleted|Kinnita töö|Märgi.*tehtuks/)
})
