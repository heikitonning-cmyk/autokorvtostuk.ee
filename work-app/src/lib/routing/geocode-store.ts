import type { Coordinates } from './coordinates.ts'
import { isCoordinates } from './coordinates.ts'
import type { GeocodeStore } from './geocode.ts'

export function createSupabaseGeocodeStore(supabase: any): GeocodeStore {
  return {
    async get(normalizedAddress: string): Promise<Coordinates | null> {
      const { data, error } = await supabase.rpc('get_cached_geocode', {
        p_normalized_address: normalizedAddress,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      if (!row) return null
      const coordinates = {
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
      }
      return isCoordinates(coordinates) ? coordinates : null
    },

    async save(input) {
      const { error } = await supabase.rpc('save_geocode_result', {
        p_normalized_address: input.normalizedAddress,
        p_address_snapshot: input.address,
        p_latitude: input.coordinates.latitude,
        p_longitude: input.coordinates.longitude,
        p_site_id: input.siteId ?? null,
        p_stop_id: input.stopId ?? null,
      })
      if (error) throw error
    },
  }
}
