'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
 const [password, setPassword] = useState('');
 const [error, setError] = useState('');
 const [isLoading, setIsLoading] = useState(false);
 const [currentTime, setCurrentTime] = useState(new Date());
 const [mounted, setMounted] = useState(false);
 const router = useRouter();
 const searchParams = useSearchParams();
 const redirectTo = searchParams.get('redirect') || '/analytics';

 useEffect(() => {
 setMounted(true);
 const timer = setInterval(() => setCurrentTime(new Date()), 1000);
 return () => clearInterval(timer);
 }, []);

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setIsLoading(true);
 setError('');

 try {
 const response = await fetch('/api/auth', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({ password }),
 });

 const data = await response.json();

 if (data.success) {
 // Set the authentication cookie
 document.cookie = 'efi-auth=authenticated; path=/; max-age=86400; secure; samesite=strict';
 // Redirect to the intended page
 router.push(redirectTo);
 } else {
 setError('Invalid password. Please try again.');
 }
 } catch (error) {
 setError('Authentication failed. Please try again.');
 } finally {
 setIsLoading(false);
 }
 };

 const formatTime = (date: Date) => {
 return date.toLocaleTimeString('en-US', { 
 hour12: false, 
 hour: '2-digit', 
 minute: '2-digit', 
 second: '2-digit' 
 });
 };

 if (!mounted) return null;

 return (
 <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
 {/* Modal backdrop */}
 <div className="absolute inset-0 bg-black/60"></div>
 
 {/* Modal container */}
 <div className="relative z-10 w-full max-w-sm mx-4">
 {/* Header */}
 <div className="text-center mb-6">
 <h1 className="text-2xl font-black text-white mb-2 tracking-tight">
 EFI TERMINAL
 </h1>
 <div className="h-px w-16 bg-gradient-to-r from-transparent via-orange-500 to-transparent mx-auto mb-3"></div>
 <p className="text-white text-sm font-medium mb-3">
 Professional Trading Intelligence
 </p>
 
 {/* Live clock */}
 <div className="inline-flex items-center px-2 py-1 bg-gray-900/50 backdrop-blur-sm rounded border border-gray-700/50">
 <div className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5 animate-pulse"></div>
 <span className="text-[10px] text-white font-mono">
 {formatTime(currentTime)} EST • LIVE
 </span>
 </div>
 </div>

 {/* Compact login form */}
 <div className="relative">
 {/* Glass morphism background */}
 <div className="absolute inset-0 bg-gradient-to-br from-gray-800/30 to-gray-900/50 backdrop-blur-xl rounded-xl"></div>
 <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent rounded-xl"></div>
 
 <div className="relative bg-gray-900/40 backdrop-blur-xl rounded-xl shadow-2xl border border-gray-700/50 p-6">
 <form onSubmit={handleSubmit} className="space-y-4">
 <div>
 <label htmlFor="password" className="block text-xs font-semibold text-white mb-2 uppercase tracking-wider">
 Access Code
 </label>
 <div className="relative">
 <input
 id="password"
 type="password"
 value={password}
 onChange={(e) => setPassword(e.target.value)}
 className="w-full px-3 py-2.5 bg-black/60 border border-gray-600/50 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all duration-300 font-mono text-sm backdrop-blur-sm"
 placeholder="Enter code"
 required
 disabled={isLoading}
 />
 </div>
 </div>

 {error && (
 <div className="relative">
 <div className="relative bg-red-950/40 border border-red-500/30 rounded-lg p-2.5 text-red-300 text-xs font-medium backdrop-blur-sm">
 <div className="flex items-center">
 <div className="w-1.5 h-1.5 bg-red-400 rounded-full mr-2 animate-pulse"></div>
 {error}
 </div>
 </div>
 </div>
 )}

 <button
 type="submit"
 disabled={isLoading}
 className="group relative w-full overflow-hidden rounded-lg"
 >
 <div className="relative bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 disabled:from-orange-800 disabled:to-orange-900 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-lg transition-all duration-300 transform group-hover:scale-[1.02] group-active:scale-[0.98] shadow-lg shadow-orange-500/25">
 {isLoading ? (
 <div className="flex items-center justify-center">
 <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white mr-2"></div>
 <span className="font-mono tracking-wider text-sm">AUTHENTICATING...</span>
 </div>
 ) : (
 <span className="font-mono tracking-wider text-sm">ACCESS TERMINAL</span>
 )}
 </div>
 </button>
 </form>

 {/* Compact status indicators */}
 <div className="mt-4 pt-4 border-t border-gray-700/30">
 <div className="flex justify-center space-x-6 text-center">
 <div className="flex items-center">
 <div className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5 animate-pulse"></div>
 <span className="text-[9px] font-semibold text-white uppercase tracking-wider">LIVE</span>
 </div>
 <div className="flex items-center">
 <div className="w-1.5 h-1.5 bg-orange-400 rounded-full mr-1.5 animate-pulse"></div>
 <span className="text-[9px] font-semibold text-white uppercase tracking-wider">SECURE</span>
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* Compact footer */}
 <div className="text-center text-[10px] text-white mt-4">
 <p className="font-mono tracking-wider opacity-60">© 2025 EFI TRADING INTELLIGENCE</p>
 </div>
 </div>
 </div>
 );
}

export default function LoginPage() {
 return (
 <Suspense fallback={
 <div className="min-h-screen flex items-center justify-center bg-black">
 <div className="text-white">Loading...</div>
 </div>
 }>
 <LoginForm />
 </Suspense>
 );
}