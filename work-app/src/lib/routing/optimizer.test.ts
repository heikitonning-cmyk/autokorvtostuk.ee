import test from 'node:test'
import assert from 'node:assert/strict'
import { optimizeFixedEndpoints, pathMetrics } from './optimizer.ts'

test('optimizer keeps fixed endpoints and finds a faster stop order', () => {
  const matrix = {
    S:{A:10,B:2,E:99},
    A:{B:10,E:2,S:10},
    B:{A:2,E:10,S:2},
    E:{S:99,A:2,B:10},
  }
  assert.deepEqual(optimizeFixedEndpoints('S',['A','B'],'E',matrix), ['B','A'])
})

test('optimizer preserves duplicate stop occurrences by unique stop ids', () => {
  const matrix = {
    S:{A1:1,A2:2,E:9}, A1:{A2:1,E:2,S:1}, A2:{A1:1,E:1,S:2}, E:{A1:2,A2:1,S:9},
  }
  const order = optimizeFixedEndpoints('S',['A1','A2'],'E',matrix)
  assert.equal(order.length, 2)
  assert.deepEqual(new Set(order), new Set(['A1','A2']))
})

test('path metrics include start, every stop, and fixed end', () => {
  const duration = { S:{A:3}, A:{B:4}, B:{E:5} }
  const distance = { S:{A:300}, A:{B:400}, B:{E:500} }
  assert.deepEqual(pathMetrics('S',['A','B'],'E',duration,distance), { durationSeconds:12, distanceMeters:1200 })
})
