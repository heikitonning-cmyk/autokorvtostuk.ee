import { buildNominatimSearch, parseNominatimResult } from './nominatim.ts'
import { OnePerSecondQueue } from './queue.ts'

type DurableObjectStorageLike = {
  get<T = unknown>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
}

type DurableObjectContextLike = {
  storage: DurableObjectStorageLike
}

type Env = {
  NOMINATIM_BASE_URL?: string
  ROUTING_USER_AGENT?: string
}

export class GeocodeThrottle {
  private readonly env: Env
  private readonly queue: OnePerSecondQueue

  constructor(ctx: DurableObjectContextLike, env: Env) {
    this.env = env
    this.queue = new OnePerSecondQueue({
      loadLastStartedAt: async () => (await ctx.storage.get<number>('lastStartedAt')) ?? null,
      saveLastStartedAt: async (value) => { await ctx.storage.put('lastStartedAt', value) },
    })
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json({ error: 'method-not-allowed' }, { status: 405 })
    }

    let address = ''
    try {
      const body = await request.json() as { address?: unknown }
      address = typeof body.address === 'string' ? body.address.trim() : ''
    } catch {
      return Response.json({ error: 'invalid-request' }, { status: 400 })
    }
    if (!address) return Response.json({ error: 'invalid-request' }, { status: 400 })

    const userAgent = this.env.ROUTING_USER_AGENT?.trim()
    if (!userAgent) return Response.json({ error: 'geocode-provider-failed' }, { status: 502 })

    return this.queue.run(async () => {
      try {
        const url = buildNominatimSearch(address, this.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org')
        const response = await fetch(url, {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'application/json',
          },
        })
        if (!response.ok) return Response.json({ error: 'geocode-provider-failed' }, { status: 502 })
        const coordinates = parseNominatimResult(await response.json())
        if (!coordinates) return Response.json({ error: 'geocode-not-found' }, { status: 404 })
        return Response.json(coordinates)
      } catch {
        return Response.json({ error: 'geocode-provider-failed' }, { status: 502 })
      }
    })
  }
}

export default {
  async fetch(): Promise<Response> {
    return Response.json({ error: 'not-found' }, { status: 404 })
  },
}
