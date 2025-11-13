'use client';

import { signIn, signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return; // Still loading

    if (!session) {
      // Not signed in, redirect to sign-in page
      router.push('/auth/signin');
      return;
    }

    if (!session.user.hasAccess) {
      // Signed in but doesn't have required Discord role
      router.push('/auth/no-access');
      return;
    }
  }, [session, status, router]);

  // Show loading while checking authentication
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Show sign-in prompt if not authenticated
  if (!session) {
    return null; // Will redirect via useEffect
  }

  // Show no access message if user doesn't have required role
  if (!session.user.hasAccess) {
    return null; // Will redirect via useEffect
  }

  // User is authenticated and has access
  return <>{children}</>;
}

// Header component with Discord login/logout
export function AuthHeader() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <div className="text-white">Loading...</div>;
  }

  if (!session) {
    return (
      <button
        onClick={() => signIn('discord')}
        className="bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-2 rounded-lg flex items-center gap-2"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.195.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
        Sign in with Discord
      </button>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div className="text-white">
        Welcome, {session.user.name}
        {session.user.hasAccess && (
          <span className="ml-2 bg-green-500 text-xs px-2 py-1 rounded">
            ✓ Verified
          </span>
        )}
      </div>
      <button
        onClick={() => signOut()}
        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded"
      >
        Sign Out
      </button>
    </div>
  );
}