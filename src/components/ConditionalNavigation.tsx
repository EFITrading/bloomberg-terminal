'use client';

import { usePathname } from 'next/navigation';
import Navigation from '@/components/terminal/Navigation';

export default function ConditionalNavigation() {
 const pathname = usePathname();

 // Don't show navigation on login page to keep it clean
 if (pathname === '/login') {
 return null;
 }

 // /chart-embed is a bare headless-screenshot target (Discord card chart capture) - the
 // fixed/sticky site nav bar sits on top of the chart canvas at those coordinates and gets
 // included in the Puppeteer element screenshot otherwise.
 if (pathname === '/chart-embed') {
 return null;
 }

 // Always show navigation
 return <Navigation />;
}