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

const LoginBackground: React.FC<LoginBackgroundProps> = ({ className = '' }) => {
  return (
    <div className={`login-background ${className}`}>
      <div className="login-background__gradient" />
      <div className="login-background__grid" />
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
      <div className="login-background__line">
        <svg viewBox="0 0 800 400" preserveAspectRatio="none">
          <path d="M0,280 C120,220 160,120 260,150 C360,180 370,270 470,230 C560,190 600,90 720,130 C780,150 820,210 820,210" />
          <g className="login-background__line-points">
            <circle cx="100" cy="240" r="6" />
            <circle cx="240" cy="160" r="6" />
            <circle cx="360" cy="220" r="6" />
            <circle cx="520" cy="200" r="6" />
            <circle cx="680" cy="150" r="6" />
          </g>
        </svg>
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
