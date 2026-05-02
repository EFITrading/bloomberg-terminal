'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AccountPage() {
  const router = useRouter();
  const [hasPasswordAuth, setHasPasswordAuth] = useState(false);

  useEffect(() => {
    const cookies = document.cookie.split(';');
    const authCookie = cookies.find(c => c.trim().startsWith('efi-auth='));
    setHasPasswordAuth(!!authCookie && authCookie.split('=')[1]?.trim() === 'authenticated');
  }, []);

  const handleLogout = () => {
    document.cookie = 'efi-auth=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-black text-white p-8 pt-24 flex flex-col items-center">
      <div className="max-w-4xl w-full mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-orange-500 mb-2">Account Management</h1>
          <div className="h-1 w-20 bg-orange-500 rounded mx-auto"></div>
        </div>

        {/* Account Information Card */}
        <div className="relative overflow-hidden rounded-xl mb-6 shadow-2xl">
          <div className="relative border border-gray-700/50 rounded-xl p-8" style={{
            background: 'linear-gradient(135deg, rgba(0,0,0,0.95) 0%, rgba(20,20,20,0.95) 50%, rgba(0,0,0,0.95) 100%)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.8)'
          }}>
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <svg className="w-6 h-6 mr-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile Information
            </h2>

            <div className="relative overflow-hidden rounded-lg p-6" style={{
              background: 'linear-gradient(135deg, rgba(0,0,0,0.9) 0%, rgba(15,15,15,0.9) 50%, rgba(0,0,0,0.9) 100%)',
              border: '1px solid rgba(255, 102, 0, 0.2)',
            }}>
              <div className="flex items-center space-x-4">
                <div className="w-20 h-20 bg-gradient-to-br from-orange-600 to-orange-400 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="mb-2 flex items-start gap-16">
                    <div>
                      <label className="text-sm text-gray-400 uppercase tracking-wider">Username</label>
                      <p className="text-xl font-bold text-white">EFI Member</p>
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255, 102, 0, 1)' }}>Member Type</label>
                      <p className="text-sm font-bold mt-1" style={{ color: '#3B82F6' }}>Premium Access</p>
                    </div>
                  </div>
                  <div className="mb-2 flex items-start gap-16">
                    <div>
                      <label className="text-sm text-gray-400 uppercase tracking-wider">Auth Method</label>
                      <p className="text-white">Password Authentication</p>
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255, 102, 0, 1)' }}>Status</label>
                      <p className="text-sm font-bold flex items-center mt-1" style={{ color: '#22C55E' }}>
                        <span className="w-1.5 h-1.5 rounded-full mr-1.5 animate-pulse inline-block" style={{ background: '#22C55E' }}></span>
                        {hasPasswordAuth ? 'Active' : 'Not authenticated'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions Card */}
        <div className="relative overflow-hidden rounded-xl shadow-2xl">
          <div className="relative border border-gray-700/50 rounded-xl p-8" style={{
            background: 'linear-gradient(135deg, rgba(0,0,0,0.95) 0%, rgba(20,20,20,0.95) 50%, rgba(0,0,0,0.95) 100%)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.8)'
          }}>
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <svg className="w-6 h-6 mr-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Account Actions
            </h2>

            <div className="space-y-4">
              <button
                onClick={handleLogout}
                className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 shadow-lg shadow-red-500/25 flex items-center justify-center"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="font-mono tracking-wider">LOGOUT</span>
              </button>

              <button
                onClick={() => router.push('/analytics')}
                className="w-full bg-gradient-to-r from-gray-700 to-gray-600 hover:from-gray-600 hover:to-gray-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 shadow-lg flex items-center justify-center"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span className="font-mono tracking-wider">BACK TO TERMINAL</span>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-gray-500">
          <p className="font-mono">© 2025 EFI TRADING INTELLIGENCE</p>
        </div>
      </div>
    </div>
  );
}
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-gray-500">
          <p className="font-mono">Â© 2025 EFI TRADING INTELLIGENCE</p>
        </div>
      </div>
    </div>
  );
}