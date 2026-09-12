import { getCloudflareContext } from '@opennextjs/cloudflare'
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

export async function geocodeThroughConfiguredThrottle(address: string): Promise<Coordinates | null> {
  let namespace: DurableObjectNamespaceLike | undefined
  try {
    const { env } = getCloudflareContext()
    namespace = (env as unknown as { GEOCODE_THROTTLE?: DurableObjectNamespaceLike }).GEOCODE_THROTTLE
  } catch {
    throw new Error('geocode-provider-failed')
  }
  if (!namespace) throw new Error('geocode-provider-failed')
  return geocodeThroughThrottle(namespace, address)
}
