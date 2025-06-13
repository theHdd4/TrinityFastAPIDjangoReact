import React from 'react';

interface LogoTextProps {
  className?: string;
  /**
   * Additional classes for the title element. If none are provided the
   * brand gradient is used.
   */
  titleClassName?: string;
}

const LogoText: React.FC<LogoTextProps> = ({ className = '', titleClassName }) => (
  <div className={`flex flex-col ${className}`.trim()}>
    <h1
      className={`text-2xl font-bold tracking-tight leading-none font-mono ${
        titleClassName || 'bg-gradient-to-r from-black via-gray-800 to-trinity-yellow bg-clip-text text-transparent'
      }`}
    >
      Trinity
    </h1>
    <span className="text-xs font-light text-gray-600 tracking-widest uppercase mt-0.5 font-mono">
      A Quant Matrix AI Product
    </span>
  </div>
);

export default LogoText;
