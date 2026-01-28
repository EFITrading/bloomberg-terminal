'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    redirectTo?: string;
}

export default function LoginModal({ isOpen, onClose, redirectTo = '/market-overview' }: LoginModalProps) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const router = useRouter();

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        // Close modal on escape key
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

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
                onClose();
                window.location.href = redirectTo;
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

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-[9999]"
            onClick={onClose}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80"></div>

            {/* Modal container */}
            <div
                className="relative z-10 w-full max-w-lg"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute -top-12 right-0 text-white/70 hover:text-white text-4xl font-light w-10 h-10 flex items-center justify-center transition-colors"
                    aria-label="Close"
                >
                    ×
                </button>

                {/* Header */}
                <div className="text-center mb-10">
                    <h1 className="text-8xl font-black text-white mb-3 tracking-tight">
                        EFI
                    </h1>
                    <h1 className="text-8xl font-black text-orange-500 mb-6 tracking-tight">
                        TERMINAL
                    </h1>
                    <div className="h-px w-32 bg-gradient-to-r from-transparent via-orange-500 to-transparent mx-auto mb-6"></div>
                    <p className="text-white text-2xl font-medium mb-6">
                        Professional Trading Intelligence
                    </p>

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
                                <label htmlFor="password" className="block text-xl font-bold text-white mb-4 uppercase tracking-wider">
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
                                        autoFocus
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

                            {/* Divider */}
                            <div className="relative my-7">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-gray-600/30"></div>
                                </div>
                                <div className="relative flex justify-center text-base">
                                    <span className="bg-gray-900/70 px-4 text-gray-400 font-mono">or</span>
                                </div>
                            </div>

                            {/* Discord Login Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    signIn('discord', { callbackUrl: redirectTo });
                                }}
                                className="w-full bg-black hover:bg-gray-950 border-2 border-gray-700 hover:border-orange-500/50 text-white font-bold py-5 px-8 rounded-lg transition-all duration-300 flex items-center justify-center space-x-3 text-lg"
                            >
                                <svg className="w-7 h-7 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.195.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                                </svg>
                                <span className="font-mono tracking-wider text-lg">SIGN IN WITH DISCORD</span>
                            </button>
                        </form>

                        {/* Status indicators */}
                        <div className="mt-8 pt-7 border-t border-gray-700/30">
                            <div className="flex justify-center space-x-10 text-center">
                                <div className="flex items-center">
                                    <div className="w-2.5 h-2.5 bg-green-400 rounded-full mr-2.5 animate-pulse"></div>
                                    <span className="text-sm font-bold text-white uppercase tracking-wider">LIVE</span>
                                </div>
                                <div className="flex items-center">
                                    <div className="w-2.5 h-2.5 bg-orange-400 rounded-full mr-2.5 animate-pulse"></div>
                                    <span className="text-sm font-bold text-white uppercase tracking-wider">SECURE</span>
                                </div>
                                <div className="flex items-center">
                                    <div className="w-2.5 h-2.5 bg-blue-400 rounded-full mr-2.5 animate-pulse"></div>
                                    <span className="text-sm font-bold text-white uppercase tracking-wider">24/7</span>
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
    );
}
