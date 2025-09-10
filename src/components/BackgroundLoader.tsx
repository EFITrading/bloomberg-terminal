'use client';

import { useEffect, useState } from 'react';
import BackgroundDataService from '@/lib/backgroundDataService';

interface LoadingIndicatorProps {
  showIndicator?: boolean;
}

const BackgroundLoader: React.FC<LoadingIndicatorProps> = ({ showIndicator = false }) => {
  const [loadingStatus, setLoadingStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(showIndicator);

  useEffect(() => {
    const backgroundService = BackgroundDataService.getInstance();
    
    // Subscribe to loading status updates
    backgroundService.onStatusUpdate((status: string, progress: number) => {
      setLoadingStatus(status);
      setProgress(progress);
      
      // Auto-hide when complete
      if (progress >= 100) {
        setTimeout(() => setIsVisible(false), 2000);
      }
    });

    // Start background loading after a short delay to let the page load first
    const startTimer = setTimeout(() => {
      backgroundService.startProgressiveLoading();
    }, 1000);

    return () => clearTimeout(startTimer);
  }, []);

  if (!showIndicator || !isVisible) {
    return null;
  }

  return (
    <div 
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        background: 'rgba(0, 0, 0, 0.8)',
        color: '#00ff41',
        padding: '10px 15px',
        borderRadius: '5px',
        fontSize: '12px',
        fontFamily: 'monospace',
        zIndex: 1000,
        border: '1px solid #00ff41',
        maxWidth: '300px'
      }}
    >
      <div style={{ marginBottom: '5px' }}>
        📊 Background Data Loading
      </div>
      <div style={{ marginBottom: '5px', fontSize: '10px' }}>
        {loadingStatus}
      </div>
      <div 
        style={{
          width: '100%',
          height: '4px',
          background: '#333',
          borderRadius: '2px',
          overflow: 'hidden'
        }}
      >
        <div 
          style={{
            width: `${progress}%`,
            height: '100%',
            background: '#00ff41',
            transition: 'width 0.3s ease'
          }}
        />
      </div>
      <div style={{ fontSize: '10px', marginTop: '2px', opacity: 0.7 }}>
        {Math.round(progress)}% complete
      </div>
    </div>
  );
};

export default BackgroundLoader;
