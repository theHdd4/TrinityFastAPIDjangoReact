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
      <div className="relative w-full mt-1 h-1">
        <div className="absolute left-0 top-0 h-full w-0 overflow-hidden animate-line-grow">
          <svg
            className="w-full h-full text-trinity-yellow"
            viewBox="0 0 100 4"
            preserveAspectRatio="none"
          >
            <polyline
              points="0,2 10,1 20,3 30,1 40,3 50,1 60,3 70,1 80,3 90,1 100,2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </div>
        <span className="absolute left-0 top-1/2 w-2 h-2 rounded-full bg-black -translate-x-1/2 -translate-y-1/2 animate-dot-travel" />
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
