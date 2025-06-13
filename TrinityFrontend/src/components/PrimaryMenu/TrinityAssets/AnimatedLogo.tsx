import React from 'react';

interface AnimatedLogoProps {
  className?: string;
}

const AnimatedLogo: React.FC<AnimatedLogoProps> = ({ className = 'w-12 h-12' }) => (
  <div
    className={`relative ${className} rounded-lg bg-black shadow-lg flex items-center justify-center overflow-hidden border border-gray-800`}
  >
    {/* Matrix digital rain effect */}
    <div className="absolute inset-0 bg-gradient-to-b from-trinity-yellow/10 to-trinity-green/20" />
    {/* Animated matrix dots */}
    <div className="absolute top-1 left-2 w-0.5 h-0.5 bg-trinity-yellow rounded-full animate-pulse opacity-70" />
    <div className="absolute top-3 right-2 w-0.5 h-0.5 bg-trinity-green rounded-full animate-ping opacity-60" />
    <div className="absolute bottom-2 left-1 w-0.5 h-0.5 bg-trinity-yellow rounded-full animate-pulse opacity-80" />
    <div className="absolute bottom-1 right-3 w-0.5 h-0.5 bg-trinity-green rounded-full animate-ping opacity-50" />
    {/* Trinity symbol - Matrix-inspired geometric design */}
    <div className="relative z-10 flex items-center justify-center">
      <svg width="24" height="24" viewBox="0 0 24 24" className="text-trinity-yellow">
        <defs>
          <linearGradient id="matrixGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFBD59" stopOpacity="1" />
            <stop offset="50%" stopColor="#41C185" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#FFBD59" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <g fill="url(#matrixGradient)">
          <polygon points="12,3 15,8 9,8" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.9" />
          <polygon points="7,12 10,17 4,17" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.9" />
          <polygon points="17,12 20,17 14,17" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.9" />
          <circle cx="12" cy="12" r="2" fill="currentColor" opacity="1" />
          <line x1="12" y1="8" x2="12" y2="10" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <line x1="9" y1="12" x2="10" y2="12" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <line x1="14" y1="12" x2="15" y2="12" stroke="currentColor" strokeWidth="1" opacity="0.7" />
        </g>
      </svg>
    </div>
    {/* Subtle scan line effect */}
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-trinity-yellow/10 to-transparent transform -skew-x-12 animate-pulse" />
  </div>
);

export default AnimatedLogo;
