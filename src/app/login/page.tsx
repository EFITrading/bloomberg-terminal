'use client'

import { Suspense, useEffect, useState } from 'react'

import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  // Validate redirect to prevent open-redirect attacks — only allow relative paths
  const rawRedirect = searchParams.get('redirect') || ''
  const redirectTo =
    rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/market-overview'

  useEffect(() => {
    setMounted(true)
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      })

      const data = await response.json()

      if (data.success) {
        // Cookie is already set by the API
        // Force a hard redirect to ensure cookie is picked up
        window.location.href = redirectTo
      } else {
        setError('Invalid password. Please try again.')
      }
    } catch (error) {
      setError('Authentication failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  if (!mounted) return null

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80"></div>

      {/* Modal container */}
      <div className="relative z-10 w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-8xl font-black text-white mb-3 tracking-tight">EFI</h1>
          <h1 className="text-8xl font-black text-orange-500 mb-6 tracking-tight">TERMINAL</h1>
          <div className="h-px w-32 bg-gradient-to-r from-transparent via-orange-500 to-transparent mx-auto mb-6"></div>
          <p className="text-white text-2xl font-medium mb-6">Professional Trading Intelligence</p>

          {/* Live clock */}
          <div className="inline-flex items-center px-4 py-2.5 bg-gray-900/50 backdrop-blur-sm rounded border border-gray-700/50">
            <div className="w-2.5 h-2.5 bg-green-400 rounded-full mr-2.5 animate-pulse"></div>
            <span className="text-sm text-white font-mono font-semibold">
              {formatTime(currentTime)} EST • LIVE
            </span>
          </div>
        </div>

        {/* Login form */}
        <div className="relative">
          <div className="relative bg-gray-900/70 backdrop-blur-xl rounded-xl shadow-2xl border border-gray-700/50 p-10">
            <form onSubmit={handleSubmit} className="space-y-7">
              <div>
                <label
                  htmlFor="password"
                  className="block text-xl font-bold text-white mb-4 uppercase tracking-wider"
                >
                  Terminal EFI Unit
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-5 py-5 bg-black/70 border border-gray-600/50 rounded-lg text-white text-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all duration-300 font-mono backdrop-blur-sm"
                    placeholder="Enter code"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              {error && (
                <div className="relative">
                  <div className="relative bg-red-950/40 border border-red-500/30 rounded-lg p-4 text-red-300 text-base font-medium backdrop-blur-sm">
                    <div className="flex items-center">
                      <div className="w-2.5 h-2.5 bg-red-400 rounded-full mr-3 animate-pulse"></div>
                      {error}
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-black hover:bg-gray-950 border-3 border-orange-500 hover:border-orange-400 text-orange-500 hover:text-orange-400 font-bold py-5 px-8 rounded-lg transition-all duration-300 shadow-lg shadow-orange-500/25 text-lg"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-3 border-orange-500/30 border-t-orange-500 mr-3"></div>
                    <span className="font-mono tracking-wider text-lg">AUTHENTICATING...</span>
                  </div>
                ) : (
                  <span className="font-mono tracking-wider text-lg">ACCESS TERMINAL</span>
                )}
              </button>

            </form>

            {/* Status indicators */}
            <div className="mt-8 pt-7 border-t border-gray-700/30">
              <div className="flex justify-center space-x-10 text-center">
                <div className="flex items-center">
                  <div className="w-2.5 h-2.5 bg-green-400 rounded-full mr-2.5 animate-pulse"></div>
                  <span className="text-sm font-bold text-white uppercase tracking-wider">
                    LIVE
                  </span>
                </div>
                <div className="flex items-center">
                  <div className="w-2.5 h-2.5 bg-orange-400 rounded-full mr-2.5 animate-pulse"></div>
                  <span className="text-sm font-bold text-white uppercase tracking-wider">
                    SECURE
                  </span>
                </div>
                <div className="flex items-center">
                  <div className="w-2.5 h-2.5 bg-blue-400 rounded-full mr-2.5 animate-pulse"></div>
                  <span className="text-sm font-bold text-white uppercase tracking-wider">
                    24/7
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-white mt-6">
          <p className="font-mono tracking-wider font-semibold">© 2025 EFI TRADING INTELLIGENCE</p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-black">
          <div className="text-white">Loading...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
