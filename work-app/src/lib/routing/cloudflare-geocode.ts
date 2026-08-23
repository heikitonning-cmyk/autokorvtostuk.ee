import { isCoordinates, type Coordinates } from './coordinates.ts'

type DurableObjectStubLike = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

export type DurableObjectNamespaceLike = {
  idFromName(name: string): unknown
  get(id: unknown): DurableObjectStubLike
}

export async function geocodeThroughThrottle(
  namespace: DurableObjectNamespaceLike,
  address: string,
): Promise<Coordinates | null> {
  const id = namespace.idFromName('global')
  const stub = namespace.get(id)
  const response = await stub.fetch('https://geocode.internal/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  })

  if (response.status === 404) return null
  if (!response.ok) throw new Error('geocode-provider-failed')

  const payload = await response.json()
  if (!isCoordinates(payload)) throw new Error('geocode-provider-failed')
  return payload
}
