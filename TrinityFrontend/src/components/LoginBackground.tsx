import React from 'react';
import './LoginBackground.css';

interface LoginBackgroundProps {
  className?: string;
}

const BAR_CONFIGS = [
  { height: '62%', delay: '0s', duration: '4.5s' },
  { height: '82%', delay: '0.6s', duration: '5.5s' },
  { height: '48%', delay: '1.2s', duration: '4s' },
  { height: '96%', delay: '0.9s', duration: '6s' },
  { height: '70%', delay: '1.8s', duration: '5s' },
];

const PARTICLE_CONFIGS = [
  { left: '12%', top: '18%', size: '6px', delay: '0s', duration: '10s' },
  { left: '28%', top: '62%', size: '5px', delay: '1.6s', duration: '9s' },
  { left: '44%', top: '32%', size: '4px', delay: '2.4s', duration: '8s' },
  { left: '58%', top: '68%', size: '5px', delay: '0.8s', duration: '11s' },
  { left: '76%', top: '24%', size: '6px', delay: '1.2s', duration: '10s' },
  { left: '86%', top: '58%', size: '4px', delay: '2s', duration: '7.5s' },
  { left: '34%', top: '78%', size: '5px', delay: '2.8s', duration: '12s' },
  { left: '68%', top: '82%', size: '4px', delay: '3.2s', duration: '9.5s' },
  { left: '18%', top: '72%', size: '4px', delay: '1.4s', duration: '11.5s' },
  { left: '52%', top: '14%', size: '5px', delay: '0.4s', duration: '9s' },
  { left: '64%', top: '44%', size: '4px', delay: '2.2s', duration: '8.5s' },
  { left: '88%', top: '38%', size: '5px', delay: '1.8s', duration: '10.5s' },
];

const LINE_POINTS = [
  { x: 40, y: 250, label: '0.01234', anchor: 'start' as const },
  { x: 180, y: 210, label: '0.45678', anchor: 'middle' as const },
  { x: 320, y: 140, label: '0.78901', anchor: 'end' as const },
  { x: 470, y: 190, label: '0.45678', anchor: 'middle' as const },
  { x: 620, y: 110, label: '0.22345', anchor: 'start' as const },
];

const LoginBackground: React.FC<LoginBackgroundProps> = ({ className = '' }) => {
  return (
    <div className={`login-background ${className}`}>
      <div className="login-background__gradient" />
      <div className="login-background__grid" />
      <div className="login-background__line">
        <svg viewBox="0 0 760 420" preserveAspectRatio="none">
          <defs>
            <linearGradient id="loginLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1affd8" />
              <stop offset="50%" stopColor="#26d4ff" />
              <stop offset="100%" stopColor="#1affd8" />
            </linearGradient>
            <filter id="loginLineGlow" x="-15%" y="-35%" width="130%" height="170%" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation="6" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="loginBarGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3c495f" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#111c29" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          <g className="login-background__line-bars">
            <rect x="120" y="140" width="48" height="200" rx="6" />
            <rect x="270" y="80" width="60" height="260" rx="8" />
            <rect x="430" y="160" width="56" height="180" rx="7" />
            <rect x="600" y="60" width="64" height="280" rx="9" />
          </g>

          <g className="login-background__line-track">
            <path
              className="login-background__line-shadow"
              d="M-40 280 C 70 240 120 160 210 180 C 305 200 340 110 420 150 C 500 190 540 70 630 120 C 690 150 760 130 780 180"
            />
            <path
              className="login-background__line-path"
              d="M-40 280 C 70 240 120 160 210 180 C 305 200 340 110 420 150 C 500 190 540 70 630 120 C 690 150 760 130 780 180"
            />
          </g>

          <g className="login-background__line-highlights">
            {LINE_POINTS.map((point, index) => (
              <g key={`point-${index}`} className="login-background__line-point" transform={`translate(${point.x}, ${point.y})`}>
                <circle r="9" />
                <rect x="-22" y="-58" width="90" height="38" rx="6" />
                <text x={point.anchor === 'start' ? -12 : point.anchor === 'end' ? 32 : 23} y="-35" textAnchor={point.anchor}>
                  {point.label}
                </text>
                <line x1="0" y1="-12" x2="0" y2="-20" />
              </g>
            ))}
          </g>

          <g className="login-background__line-dots">
            {Array.from({ length: 42 }).map((_, index) => {
              const column = index % 14;
              const row = Math.floor(index / 14);
              const baseX = 20 + column * 52;
              const baseY = 320 + row * 26;

              return <rect key={`dot-${index}`} x={baseX} y={baseY} width="6" height="6" rx="1" />;
            })}
          </g>
        </svg>
      </div>
      <div className="login-background__bars">
        {BAR_CONFIGS.map((bar, index) => (
          <span
            key={`bar-${index}`}
            className="login-background__bar"
            style={{
              '--bar-height': bar.height,
              '--bar-delay': bar.delay,
              '--bar-duration': bar.duration,
            } as React.CSSProperties}
          />
        ))}
      </div>
      <div className="login-background__particles">
        {PARTICLE_CONFIGS.map((particle, index) => (
          <span
            key={`particle-${index}`}
            style={{
              left: particle.left,
              top: particle.top,
              width: particle.size,
              height: particle.size,
              '--particle-delay': particle.delay,
              '--particle-duration': particle.duration,
            } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  );
};

export default LoginBackground;
