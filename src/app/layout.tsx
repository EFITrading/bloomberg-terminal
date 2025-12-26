import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import ConditionalNavigation from '@/components/ConditionalNavigation'
import Background from '@/components/terminal/Background'
import ClientSessionProvider from '@/components/ClientSessionProvider'
import { AuthGuard } from '@/components/AuthGuard'
import { MarketRegimeProvider } from '@/contexts/MarketRegimeContext'

import './globals.css'

const inter = Inter({
 variable: '--font-inter',
 subsets: ['latin'],
})

export const metadata: Metadata = {
 title: 'EFI Terminal - Professional Trading Platform',
 description: 'Advanced analytics platform featuring 20-year historical seasonality patterns, real-time derivative flow analysis, and proprietary market regime detection.',
}

export default function RootLayout({
 children,
}: Readonly<{
 children: React.ReactNode
}>) {
 return (
 <html lang="en">
 <body className={`${inter.variable} antialiased`}>
 <ClientSessionProvider>
 <MarketRegimeProvider>
 <AuthGuard>
 <div className="terminal-app">
 <Background />
 <ConditionalNavigation />
 <main className="main-content">
 {children}
 </main>
 </div>
 </AuthGuard>
 </MarketRegimeProvider>
 </ClientSessionProvider>
 </body>
 </html>
 )
}
