import test from 'node:test'
import assert from 'node:assert/strict'
import { OnePerSecondQueue } from '../../../cloudflare/geocode-throttle/src/queue.ts'

test('global geocode queue spaces concurrent starts by at least one second', async () => {
  let clock = 0
  let persisted: number | null = null
  const starts: number[] = []
  const queue = new OnePerSecondQueue({
    now: () => clock,
    sleep: async (ms) => { clock += ms },
    minGapMs: 1000,
    loadLastStartedAt: async () => persisted,
    saveLastStartedAt: async (value) => { persisted = value },
  })

  await Promise.all([
    queue.run(async () => { starts.push(clock) }),
    queue.run(async () => { starts.push(clock) }),
    queue.run(async () => { starts.push(clock) }),
  ])

  assert.deepEqual(starts, [0, 1000, 2000])
  assert.equal(persisted, 2000)
})
