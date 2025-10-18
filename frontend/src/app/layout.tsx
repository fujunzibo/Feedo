import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Feedo Fund Dashboard',
  description: 'Feedo Fund Management Dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-inter">{children}</body>
    </html>
  )
}

