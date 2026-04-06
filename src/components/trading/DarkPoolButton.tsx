import React from 'react'

interface DarkPoolButtonProps {
  isActive?: boolean
  isLoading?: boolean
  progress?: number // 0-100
  onClick?: () => void
}

export default function DarkPoolButton({
  isActive,
  isLoading,
  progress = 0,
  onClick,
}: DarkPoolButtonProps) {
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
          overflow: 'hidden',
        }}
        title="Dark Pool prints — FINRA TRF off-exchange block trades"
      >
        {/* Progress bar fill behind the text */}
        {isLoading && (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              width: `${progress}%`,
              background: 'rgba(0,229,255,0.12)',
              transition: 'width 0.3s ease',
              pointerEvents: 'none',
            }}
          />
        )}
        <span style={{ color: '#00E5FF', position: 'relative' }}>POI</span>
        {isLoading && (
          <span
            style={{
              color: '#00E5FF',
              fontSize: '11px',
              fontWeight: 700,
              marginLeft: '5px',
              position: 'relative',
              minWidth: '34px',
            }}
          >
            {progress}%
          </span>
        )}
        {isActive && !isLoading && (
          <span style={{ color: '#22c55e', fontSize: '16px', marginLeft: '6px' }}>✓</span>
        )}
      </button>
    </div>
  )
}
