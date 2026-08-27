import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfirmedBooking, parseBookingEmail } from './booking-import.ts'

test('parses current booking request email fields', () => {
  const parsed = parseBookingEmail(`Broneerimissoov on vastu võetud

Soovitud aeg: 2026-08-27 kell 12:19
Töö: Katuse hooldus · 2 h · ilma lisatöömeheta
Objekt: uus1
Ligikaudne maksumus: 90 €
Viide: AT-10`)

  assert.deepEqual(parsed, {
    externalRef: 'AT-10',
    plannedDate: '2026-08-27',
    plannedTime: '12:19',
    workType: 'Katuse hooldus',
    estimatedHours: 2,
    helperCount: 0,
    objectName: 'uus1',
    estimatedTotal: 90,
  })
})

test('parses older confirmed booking without work details', () => {
  const parsed = parseBookingEmail(`Broneering on kinnitatud

Aeg: 2026-08-20 kell 10:00
Objekt: Koivu 12
Ligikaudne maksumus: 90 €
Viide: AT-8`)

  assert.equal(parsed.externalRef, 'AT-8')
  assert.equal(parsed.plannedDate, '2026-08-20')
  assert.equal(parsed.plannedTime, '10:00')
  assert.equal(parsed.objectName, 'Koivu 12')
  assert.equal(parsed.estimatedTotal, 90)
  assert.equal(parsed.workType, undefined)
})

test('normalizes booking reference and defaults hours to two', () => {
  assert.deepEqual(normalizeConfirmedBooking({
    externalRef: ' at-12 ',
    plannedDate: '2026-09-01',
    plannedTime: '08:30',
  }), {
    externalRef: 'AT-12',
    plannedDate: '2026-09-01',
    plannedTime: '08:30',
    objectName: null,
    address: null,
    workType: null,
    estimatedHours: 2,
    estimatedTotal: null,
    description: null,
    helperCount: 0,
  })
})

test('rejects malformed external reference', () => {
  assert.throws(() => normalizeConfirmedBooking({
    externalRef: 'booking-12',
    plannedDate: '2026-09-01',
  }), /AT-/)
})

test('rejects invalid date, time, hours and total', () => {
  assert.throws(() => normalizeConfirmedBooking({ externalRef: 'AT-12', plannedDate: '01.09.2026' }), /plannedDate/)
  assert.throws(() => normalizeConfirmedBooking({ externalRef: 'AT-12', plannedDate: '2026-09-01', plannedTime: '8:30' }), /plannedTime/)
  assert.throws(() => normalizeConfirmedBooking({ externalRef: 'AT-12', plannedDate: '2026-09-01', estimatedHours: 0 }), /estimatedHours/)
  assert.throws(() => normalizeConfirmedBooking({ externalRef: 'AT-12', plannedDate: '2026-09-01', estimatedTotal: -1 }), /estimatedTotal/)
})
