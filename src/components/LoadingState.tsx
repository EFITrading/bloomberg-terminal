'use client';

import { ReactNode } from 'react';

interface LoadingStateProps {
  isLoading: boolean;
  error?: string | null;
  children: ReactNode;
  loadingMessage?: string;
}

const LoadingState: React.FC<LoadingStateProps> = ({
  isLoading,
  error,
  children,
  loadingMessage = 'Loading data...'
}) => {
  if (error) {
    return (
      <div 
        style={{
          padding: '20px',
          textAlign: 'center',
          color: '#ff6b6b',
          background: 'rgba(255, 107, 107, 0.1)',
          border: '1px solid #ff6b6b',
          borderRadius: '5px',
          margin: '20px'
        }}
      >
        <div style={{ fontSize: '16px', marginBottom: '10px' }}>⚠️ Error Loading Data</div>
        <div style={{ fontSize: '14px', opacity: 0.8 }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {isLoading && (
        <div 
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'rgba(0, 0, 0, 0.8)',
            color: '#00ff41',
            padding: '5px 10px',
            borderRadius: '3px',
            fontSize: '12px',
            fontFamily: 'monospace',
            zIndex: 100,
            border: '1px solid #00ff41'
          }}
        >
          🔄 {loadingMessage}
        </div>
      )}
      {children}
    </div>
  );
};

export default LoadingState;