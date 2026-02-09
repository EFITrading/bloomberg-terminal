import React from 'react';

interface BullIconProps {
    size?: number;
    className?: string;
}

export const BullIcon: React.FC<BullIconProps> = ({ size = 24, className = '' }) => {
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
            <circle cx="50" cy="50" r="48" stroke="#00FF88" strokeWidth="3" fill="rgba(0, 20, 10, 0.8)" />

            {/* Upward trend arrow */}
            <path
                d="M15 75 L30 60 L40 68 L55 48 L70 35"
                stroke="#00FF88"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
            <path
                d="M58 35 L70 35 L70 47"
                stroke="#00FF88"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </svg>
    );
};
