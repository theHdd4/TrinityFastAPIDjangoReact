import React from 'react';

interface LogoTextProps {
  className?: string;
  /**
   * Additional classes for the title element. Defaults to plain black text.
   */
  titleClassName?: string;
}

const LogoText: React.FC<LogoTextProps> = ({ className = '', titleClassName }) => (
  <div
    className={`flex h-12 flex-col justify-start items-start text-left w-fit ${className}`.trim()}
  >
    <div className="relative flex flex-col items-start w-fit">
      <h1
        className={`font-mono font-bold text-2xl leading-none ${
          titleClassName || 'text-black'
        }`.trim()}
      >
        Trinity
      </h1>
      <div className="relative w-full mt-1 h-0.5">
        <div className="absolute left-0 top-0 h-full bg-trinity-yellow w-0 animate-line-grow" />
        <span className="absolute left-0 top-0 w-2 h-2 rounded-full bg-trinity-blue -translate-x-1/2 animate-dot-travel" />
      </div>
    </div>
    <div className="w-full -mt-0.5">
      <span className="font-mono text-xs text-black/60 leading-none whitespace-nowrap">
        A Quant Matrix AI Experience
      </span>
    </div>
  </div>
);

export default LogoText;
