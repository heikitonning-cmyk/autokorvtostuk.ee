import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

test('job queries disambiguate the primary customer site foreign key', () => {
  const queries = readFileSync(resolve(root, 'src/lib/queries.ts'), 'utf8')
  const ambiguous = queries.match(/site:customer_sites\(/g) ?? []
  assert.equal(ambiguous.length, 0, 'all site embeds must name jobs_site_id_fkey explicitly')
  assert.match(queries, /site:customer_sites!jobs_site_id_fkey\(/)
})
