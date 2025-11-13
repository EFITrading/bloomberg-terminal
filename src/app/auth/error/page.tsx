'use client';

import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

export default function AuthError() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 text-red-500">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-white">
            Authentication Error
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            There was a problem with Discord authentication
          </p>
        </div>
        
        <div className="mt-8 space-y-6">
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
            <div className="text-sm text-red-300">
              <p className="font-medium">Error Details:</p>
              <p className="mt-2 font-mono text-xs">{error || 'Unknown error occurred'}</p>
            </div>
          </div>
          
          <div className="flex flex-col space-y-2">
            <button
              onClick={() => signIn('discord', { callbackUrl: '/' })}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#5865F2] hover:bg-[#4752C4] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#5865F2]"
            >
              Try Discord Login Again
            </button>
            
            <a
              href="/login"
              className="w-full flex justify-center py-2 px-4 border border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              Back to Login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}