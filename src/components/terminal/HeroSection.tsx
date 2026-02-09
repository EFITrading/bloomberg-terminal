'use client';

import { useState, useEffect } from 'react';
import AbstractCube from './AbstractCube';

export default function HeroSection() {
    const [isVisible, setIsVisible] = useState(false);
    const [ledText, setLedText] = useState('HELL');
    const [fingerActive, setFingerActive] = useState(false);
    const [buttonState, setButtonState] = useState('idle'); // idle, detecting, failed

    useEffect(() => {
        setIsVisible(true);

        // LED text cycling
        const ledWords = ['HELL', 'NICE', 'SICK', 'FIRE', 'DOPE', 'EPIC'];
        let ledIndex = 0;
        const ledInterval = setInterval(() => {
            ledIndex = (ledIndex + 1) % ledWords.length;
            setLedText(ledWords[ledIndex]);
        }, 2000);

        // Finger animation
        const fingerInterval = setInterval(() => {
            setFingerActive(true);
            setTimeout(() => setFingerActive(false), 2000);
        }, 5000);

        return () => {
            clearInterval(ledInterval);
            clearInterval(fingerInterval);
        };
    }, []);

    const handleButtonClick = () => {
        if (buttonState !== 'idle') return;

        setButtonState('detecting');
        setTimeout(() => {
            setButtonState('failed');
            setTimeout(() => {
                setButtonState('idle');
            }, 2000);
        }, 2000);
    };

    const features = [
        {
            icon: (
                <svg viewBox="0 0 24 24" className="feature-svg">
                    <defs>
                        <linearGradient id="seasonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#f59e0b" />
                            <stop offset="50%" stopColor="#fbbf24" />
                            <stop offset="100%" stopColor="#d97706" />
                        </linearGradient>
                    </defs>
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                        fill="url(#seasonGrad)" className="chart-pulse" />
                    <circle cx="12" cy="12" r="8" fill="none" stroke="#f59e0b" strokeWidth="0.5" className="orbit-ring" />
                    <circle cx="12" cy="12" r="10" fill="none" stroke="#fbbf24" strokeWidth="0.3" strokeDasharray="2,2" className="outer-ring" />
                </svg>
            ),
            text: '20-Year Seasonality Analysis',
            description: 'Advanced pattern recognition across two decades'
        },
        {
            icon: (
                <svg viewBox="0 0 24 24" className="feature-svg">
                    <defs>
                        <linearGradient id="derivGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#3b82f6" />
                            <stop offset="50%" stopColor="#60a5fa" />
                            <stop offset="100%" stopColor="#1e40af" />
                        </linearGradient>
                    </defs>
                    <path d="M3 17l6-6 4 4 8-8V9h-2V7l-6 6-4-4-8 8v1h2v2z" fill="url(#derivGrad)" className="wave-motion" />
                    <path d="M21 7h-4v2h2v2l-6 6-4-4-6 6v2l8-8 4 4 6-6V7z" fill="none" stroke="#60a5fa" strokeWidth="0.8" className="delta-trail" />
                    <circle cx="21" cy="7" r="2" fill="#3b82f6" className="pulse-point" />
                </svg>
            ),
            text: 'Real-time Derivative Flows',
            description: 'Institutional positioning and options flow tracking'
        },
        {
            icon: (
                <svg viewBox="0 0 24 24" className="feature-svg">
                    <defs>
                        <radialGradient id="marketGrad" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="#10b981" />
                            <stop offset="50%" stopColor="#34d399" />
                            <stop offset="100%" stopColor="#059669" />
                        </radialGradient>
                    </defs>
                    <circle cx="12" cy="12" r="3" fill="url(#marketGrad)" className="pulse-center" />
                    <circle cx="12" cy="12" r="6" fill="none" stroke="#10b981" strokeWidth="1" strokeDasharray="2,2" className="scan-ring-1" />
                    <circle cx="12" cy="12" r="9" fill="none" stroke="#10b981" strokeWidth="0.5" strokeDasharray="4,4" className="scan-ring-2" />
                    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="#22c55e" strokeWidth="1" className="crosshair" />
                    <polygon points="12,8 16,12 12,16 8,12" fill="none" stroke="#10b981" strokeWidth="0.8" className="radar-sweep" />
                </svg>
            ),
            text: 'AI Market Regime Detection',
            description: 'Machine learning powered trend identification'
        }
    ];

    return (
        <section className={`hero ${isVisible ? 'hero-visible' : ''}`}>
            <div className="hero-grid">
                <div className="hero-content">
                    <div className="hero-label">
                        <div className="label-dot"></div>
                        <span className="label-text">EFI Trading Intelligence</span>
                    </div>

                    <h1>
                        Next-Generation<br />
                        <span className="gradient-text">Financial Analytics</span>
                    </h1>

                    <p className="hero-description">
                        Institutional-grade trading platform combining advanced seasonality analysis,
                        real-time derivative flow monitoring, and AI-powered market regime detection.
                        Built for quantitative researchers, portfolio managers, and systematic traders.
                    </p>

                    {/* B-Unit Style Authentication Card */}
                    <div className="bunit-card-wrapper">
                        {/* Access Terminal Button */}
                        <div className="button-section">
                            <div className="button-instructions">
                                <div className="instruction-line">PLACE FINGER ON SENSOR</div>
                                <div className="instruction-subtext">Biometric authentication required</div>
                            </div>
                            <button
                                className={`terminal-access-btn ${buttonState}`}
                                onClick={handleButtonClick}
                                disabled={buttonState !== 'idle'}
                            >
                                <div className="btn-content">
                                    {buttonState === 'idle' && (
                                        <>
                                            <span className="btn-text">ACCESS TERMINAL</span>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="btn-icon">
                                                <path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </>
                                    )}
                                    {buttonState === 'detecting' && (
                                        <>
                                            <div className="loading-spinner"></div>
                                            <span className="btn-text">DETECTING CARD</span>
                                        </>
                                    )}
                                    {buttonState === 'failed' && (
                                        <>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="error-icon">
                                                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                            <span className="btn-text">NO CARD DETECTED</span>
                                        </>
                                    )}
                                </div>
                            </button>
                        </div>

                        <div className="bunit-card">
                            <div className="card-shine"></div>
                            <div className="card-top-section">
                                <div className="card-brand">EFI</div>
                                <div className="card-slot"></div>
                            </div>
                            <div className="led-display-center">
                                <span className="led-text">{ledText}</span>
                            </div>
                            <div className={`fingerprint-sensor ${fingerActive ? 'scanning' : ''}`}>
                                <svg className="fingerprint-svg" viewBox="0 0 80 80" fill="none">
                                    <circle cx="40" cy="40" r="35" stroke="rgba(212, 175, 55, 0.2)" strokeWidth="1" />
                                    <path d="M40 10 Q20 20 20 40 Q20 60 40 70" stroke="#D4AF37" strokeWidth="1.5" strokeLinecap="round" className="fp-line fp-1" />
                                    <path d="M40 10 Q60 20 60 40 Q60 60 40 70" stroke="#D4AF37" strokeWidth="1.5" strokeLinecap="round" className="fp-line fp-2" />
                                    <path d="M40 15 Q25 23 25 40 Q25 57 40 65" stroke="#D4AF37" strokeWidth="1.2" strokeLinecap="round" className="fp-line fp-3" />
                                    <path d="M40 15 Q55 23 55 40 Q55 57 40 65" stroke="#D4AF37" strokeWidth="1.2" strokeLinecap="round" className="fp-line fp-4" />
                                    <path d="M40 20 Q30 27 30 40 Q30 53 40 60" stroke="#D4AF37" strokeWidth="1" strokeLinecap="round" className="fp-line fp-5" />
                                    <path d="M40 20 Q50 27 50 40 Q50 53 40 60" stroke="#D4AF37" strokeWidth="1" strokeLinecap="round" className="fp-line fp-6" />
                                    <circle cx="40" cy="40" r="4" fill="#FFD700" className="fp-center" />
                                </svg>
                                {fingerActive && (
                                    <svg className="finger-icon" viewBox="0 0 100 100" fill="none">
                                        <ellipse cx="50" cy="70" rx="20" ry="28" fill="rgba(255, 215, 0, 0.3)" className="finger-shape" />
                                        <ellipse cx="50" cy="68" rx="18" ry="26" fill="rgba(212, 175, 55, 0.4)" />
                                        <ellipse cx="50" cy="75" rx="15" ry="8" fill="rgba(255, 215, 0, 0.6)" className="finger-tip" />
                                    </svg>
                                )}
                                <div className="sensor-glow"></div>
                                <div className={`scan-ring ${fingerActive ? 'active' : ''}`}></div>
                            </div>
                            <div className="card-bottom-section">
                                <div className="card-chip"></div>
                            </div>
                        </div>
                    </div>

                    <div className="hero-features">
                        {features.map((feature, index) => (
                            <div key={index} className="feature-item" style={{ animationDelay: `${index * 0.2}s` }}>
                                <div className="feature-icon">{feature.icon}</div>
                                <div className="feature-content">
                                    <span className="feature-text">{feature.text}</span>
                                    <span className="feature-description">{feature.description}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="hero-visual">
                    <AbstractCube />
                </div>
            </div>
        </section>
    );
}
