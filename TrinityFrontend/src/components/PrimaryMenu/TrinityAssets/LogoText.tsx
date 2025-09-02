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
    className={`flex h-12 flex-col justify-center items-start text-left leading-none w-fit ${className}`.trim()}
  >
    <div className="flex flex-col items-start w-fit">
      <h1
        className={`font-mono font-bold text-3xl leading-none ${
          titleClassName || 'text-black'
        }`.trim()}
      >
        Trinity
      </h1>
      <div className="h-0.5 bg-trinity-yellow mt-0.5 w-full" />
    </div>
    <div className="overflow-hidden mt-1 w-full">
      <span className="font-mono text-xs text-black/60 leading-none whitespace-nowrap inline-block animate-tagline-scroll">
        A Quant Matrix AI Experience
      </span>
    </div>
  </div>
);

export default LogoText;
