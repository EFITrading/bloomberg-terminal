import React from 'react'

interface BuySellButtonProps {
    isActive?: boolean
    onClick?: () => void
}

export default function BuySellButton({ isActive, onClick }: BuySellButtonProps) {
    return (
        <div className="ml-4 relative">
            <button
                onClick={onClick}
                className={`btn-3d-carved btn-drawings relative group flex items-center space-x-2${isActive ? ' active' : ''}`}
                style={{
                    padding: '10px 14px',
                    fontWeight: '700',
                    fontSize: '13px',
                    borderRadius: '4px',
                }}
                title="Buy / Sell pressure indicator"
            >
                <span style={{ color: '#FF8500' }}>BUY/SELL</span>
                {isActive && <span style={{ color: '#22c55e', fontSize: '16px', marginLeft: '6px' }}>✓</span>}
            </button>
        </div>
    )
}
