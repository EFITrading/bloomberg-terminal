import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import ConditionalNavigation from '@/components/ConditionalNavigation'
import Background from '@/components/terminal/Background'
import BackgroundLoader from '@/components/BackgroundLoader'

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
 <div className="terminal-app">
 <BackgroundLoader />
 <Background />
 <ConditionalNavigation />
 <main className="main-content">
 {children}
 </main>
 </div>
 </body>
 </html>
 )
}
