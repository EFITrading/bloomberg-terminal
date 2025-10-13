'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Navigation from '@/components/terminal/Navigation';

export default function ConditionalNavigation() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    // Check if user is authenticated by checking cookie
    const checkAuth = () => {
      const cookies = document.cookie.split(';');
      const authCookie = cookies.find(cookie => cookie.trim().startsWith('efi-auth='));
      const isAuth = authCookie && authCookie.includes('authenticated');
      
      setIsAuthenticated(!!isAuth);
      setIsLoading(false);
    };

    checkAuth();
  }, [pathname]);

  // Don't show navigation on login page to keep it clean
  if (pathname === '/login') {
    return null;
  }

  // Show loading state briefly
  if (isLoading) {
    return null;
  }

  // Always show navigation - let middleware handle page protection
  return <Navigation />;
}