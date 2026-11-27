import test from 'node:test'
import assert from 'node:assert/strict'

test('history beyond an API page does not hide newer active jobs', async () => {
  const modulePath = './pagination.ts'
  const mod = await import(modulePath).catch(() => null)
  assert.ok(mod, 'Paginated loading must be implemented')
  const rows = await mod.readAllPages(async (from: number, to: number) => {
    assert.equal(to - from, 499)
    return { data: from === 0 ? Array.from({ length: 500 }, (_, id) => ({ id, status: 'completed' })) : [{ id: 500, status: 'kinnitatud' }], error: null }
  })
  assert.equal(rows.length, 501)
  assert.deepEqual(rows.filter((r: any) => r.status === 'kinnitatud'), [{ id: 500, status: 'kinnitatud' }])
})

test('a failed later page surfaces an error instead of showing incomplete history', async () => {
  const modulePath = './pagination.ts'
  const mod = await import(modulePath).catch(() => null)
  assert.ok(mod, 'Paginated loading must be implemented')
  await assert.rejects(mod.readAllPages(async (from: number) => from === 0
    ? { data: Array.from({ length: 500 }, (_, id) => id), error: null }
    : { data: null, error: new Error('Page failed') }), /Page failed/)
})
