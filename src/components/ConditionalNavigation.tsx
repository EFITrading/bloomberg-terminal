'use client';

import { usePathname } from 'next/navigation';
import Navigation from '@/components/terminal/Navigation';

export default function ConditionalNavigation() {
 const pathname = usePathname();

 // Don't show navigation on login page to keep it clean
 if (pathname === '/login') {
 return null;
 }

 // Always show navigation
 return <Navigation />;
}