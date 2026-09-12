import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const throttleRoot = resolve(root, 'cloudflare/geocode-throttle')

test('geocode throttle is independently deployable from its own Cloudflare root', () => {
  assert.equal(existsSync(resolve(throttleRoot, 'package.json')), true)
  assert.equal(existsSync(resolve(throttleRoot, 'src/nominatim.ts')), true)

  const pkg = readFileSync(resolve(throttleRoot, 'package.json'), 'utf8')
  const index = readFileSync(resolve(throttleRoot, 'src/index.ts'), 'utf8')
  const wrangler = readFileSync(resolve(throttleRoot, 'wrangler.jsonc'), 'utf8')

  assert.match(pkg, /"deploy"\s*:\s*"wrangler deploy"/)
  assert.match(pkg, /"wrangler"/)
  assert.match(wrangler, /"name"\s*:\s*"autokorvtostuk-geocode-throttle"/)
  assert.doesNotMatch(index, /\.\.\/\.\.\/\.\.\/src\//)
  assert.match(index, /\.\/nominatim\.ts/)
})
