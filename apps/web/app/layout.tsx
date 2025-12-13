import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Home Weather Station',
  description: 'Automated irrigation control based on weather data',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

