'use client';

export default function CubeVisualization() {
  const cubeLabels = ['DATA', 'FLOW', 'SCAN', 'ALGO', 'EDGE', 'LIVE'];

  return (
    <div className="cube-container">
      {cubeLabels.map((label, index) => (
        <div key={index} className="cube-face">
          {label}
        </div>
      ))}
    </div>
  );
}
