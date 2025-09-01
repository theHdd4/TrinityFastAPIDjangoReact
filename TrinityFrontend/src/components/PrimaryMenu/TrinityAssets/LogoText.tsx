import React from 'react';

interface LogoTextProps {
  className?: string;
  /**
   * Additional classes for the title element. Defaults to plain black text.
   */
  titleClassName?: string;
}

const LogoText: React.FC<LogoTextProps> = ({ className = '', titleClassName }) => (
  <div className={`flex flex-col items-center text-center ${className}`.trim()}>
    <h1
      className={`text-4xl font-bold font-mono ${titleClassName || 'text-black'}`.trim()}
    >
      Trinity
    </h1>
    <span className="text-xs text-black/60 font-mono mt-1">
      A Quant Matrix AI Experience
    </span>
  </div>
);

export default LogoText;
