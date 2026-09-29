import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: false,
  webpack: (config) => {
    // Required for monaco-editor font assets
    config.module.rules.push({ test: /\.ttf$/, type: 'asset/resource' })
    return config
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
    scrollRestoration: false,
  },
  // CRITICAL: Ensure middleware runs in Next.js 15
  skipMiddlewareUrlNormalize: false,
  skipTrailingSlashRedirect: false,
  // Environment variables for production
  env: {
    VERCEL_ENV: process.env.VERCEL_ENV || 'development',
  },
  async headers() {
    const baseCsp = (frameSrc: string) => [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https:",
      "font-src 'self' https://fonts.gstatic.com data:",
      "connect-src 'self' https://api.polygon.io wss://socket.polygon.io https://api.stlouisfed.org https://fonts.googleapis.com",
      "worker-src 'self' blob:",
      `frame-src ${frameSrc}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')

    const securityHeaders = (frameOptions: string, frameSrc: string) => [
      { key: 'X-Frame-Options', value: frameOptions },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'Content-Security-Policy', value: baseCsp(frameSrc) },
    ]

    // All routes AI Suite is allowed to embed via iframe as "base" templates.
    const framableRoutes = ['options-flow', 'data-driven', 'market-overview', 'rrg-screener', 'analysis-suite']

    return [
      // Security headers on all pages EXCEPT the routes below, which need their own
      // frame-src/X-Frame-Options and would otherwise get merged (browsers INTERSECT multiple
      // CSP/X-Frame-Options headers, taking the most restrictive - a second header never overrides).
      {
        source: `/:path((?!ai-suite|${framableRoutes.join('|')}).*)`,
        headers: securityHeaders('DENY', "'none'"),
      },
      // CORS headers for API routes
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
      // AI Suite embeds real, same-origin app pages in an iframe as the user's "base"
      // template - allow same-origin framing only for this one page.
      {
        source: '/ai-suite',
        headers: securityHeaders('DENY', "'self'"),
      },
      // Pages that AI Suite is allowed to embed via iframe - opt in to same-origin framing only.
      ...framableRoutes.map(route => ({
        source: `/${route}`,
        headers: securityHeaders('SAMEORIGIN', "'none'"),
      })),
    ]
  },
}

export default nextConfig
