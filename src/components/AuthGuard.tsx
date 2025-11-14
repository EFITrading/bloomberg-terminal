'use client';

import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [hasPasswordAccess, setHasPasswordAccess] = useState(false);

  useEffect(() => {
    // Check password cookie
    const cookies = document.cookie.split(';');
    const authCookie = cookies.find(c => c.trim().startsWith('efi-auth='));
    if (authCookie) {
      const value = authCookie.split('=')[1];
      setHasPasswordAccess(value === process.env.NEXT_PUBLIC_SITE_PASSWORD || value === '09272025');
    }
  }, []);

  useEffect(() => {
    const publicPaths = ['/login', '/'];
    const isPublicPath = publicPaths.includes(pathname);

    if (status === 'loading') return;

    const hasAccess = (session as any)?.hasAccess || hasPasswordAccess;

    if (!isPublicPath && !hasAccess) {
      router.push('/login');
    }
  }, [session, status, pathname, router, hasPasswordAccess]);

  // Show loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-orange-500 text-xl">Loading...</div>
      </div>
    );
  }

  // Show children if authenticated or on public path
  const publicPaths = ['/login', '/'];
  if (publicPaths.includes(pathname) || (session as any)?.hasAccess || hasPasswordAccess) {
    return <>{children}</>;
  }

  // Show nothing while redirecting
  return null;
}
