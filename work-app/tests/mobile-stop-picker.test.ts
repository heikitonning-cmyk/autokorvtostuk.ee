import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

test('stop picker checkbox does not inherit full-width text-input styles on mobile', () => {
  const picker = readFileSync(resolve(root, 'src/components/StopPicker.tsx'), 'utf8')
  const css = readFileSync(resolve(root, 'src/app/globals.css'), 'utf8')

  assert.match(picker, /className="detail-card site-option"/)
  assert.match(css, /\.site-option input\[type="checkbox"\][^{]*\{[^}]*width:\s*22px/i)
  assert.match(css, /\.site-option input\[type="checkbox"\][^{]*\{[^}]*min-width:\s*22px/i)
  assert.match(css, /\.site-option>span\{[^}]*min-width:\s*0/i)
})
