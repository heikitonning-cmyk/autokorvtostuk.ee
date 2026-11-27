import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Euro Kapital tööäpp',
    short_name: 'EK Tööäpp',
    description: 'Autokorvtõstuki tööde juhtimine ja operaatori tööpäev',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f6f8',
    theme_color: '#111827',
    lang: 'et',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }],
  }
}
