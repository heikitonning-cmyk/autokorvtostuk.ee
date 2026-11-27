import test from 'node:test'
import assert from 'node:assert/strict'
import { OnePerSecondQueue } from './queue.ts'

test('geocode queue serializes starts at least one second apart', async () => {
  let clock = 0
  let persisted = 0
  const starts: number[] = []
  const queue = new OnePerSecondQueue({
    now: () => clock,
    sleep: async (ms) => { clock += ms },
    minGapMs: 1000,
    loadLastStartedAt: async () => persisted,
    saveLastStartedAt: async (value) => { persisted = value },
  })

  await Promise.all([
    queue.run(async () => { starts.push(clock); return 1 }),
    queue.run(async () => { starts.push(clock); return 2 }),
    queue.run(async () => { starts.push(clock); return 3 }),
  ])

  assert.deepEqual(starts, [1000, 2000, 3000])
  assert.equal(persisted, 3000)
})

test('geocode queue honors a persisted previous start after recreation', async () => {
  let clock = 1250
  let persisted = 1000
  const queue = new OnePerSecondQueue({
    now: () => clock,
    sleep: async (ms) => { clock += ms },
    minGapMs: 1000,
    loadLastStartedAt: async () => persisted,
    saveLastStartedAt: async (value) => { persisted = value },
  })

  await queue.run(async () => undefined)
  assert.equal(clock, 2000)
  assert.equal(persisted, 2000)
})
