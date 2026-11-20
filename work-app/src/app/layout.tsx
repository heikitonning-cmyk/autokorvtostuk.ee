import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration'

export const metadata: Metadata = {
  title: 'Euro Kapital tööäpp',
  description: 'Autokorvtõstuki tööde juhtimine',
  applicationName: 'Euro Kapital tööäpp',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#111827' }

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="et"><body>{children}<ServiceWorkerRegistration /></body></html>
}
