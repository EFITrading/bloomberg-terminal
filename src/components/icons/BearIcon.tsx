import React from 'react';

interface BearIconProps {
    size?: number;
    className?: string;
}

export const BearIcon: React.FC<BearIconProps> = ({ size = 24, className = '' }) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Outer circle */}
            <circle cx="50" cy="50" r="48" stroke="#FF3333" strokeWidth="3" fill="rgba(20, 0, 0, 0.8)" />

            {/* Downward trending diagonal lines */}
            <path d="M22 18 L78 74" stroke="#FF3333" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
            <path d="M26 18 L82 74" stroke="#FF3333" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
            <path d="M30 18 L86 74" stroke="#FF3333" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
            <path d="M18 22 L74 78" stroke="#FF3333" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
            <path d="M18 26 L74 82" stroke="#FF3333" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
            <path d="M18 30 L74 86" stroke="#FF3333" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
        </svg>
    );
};
