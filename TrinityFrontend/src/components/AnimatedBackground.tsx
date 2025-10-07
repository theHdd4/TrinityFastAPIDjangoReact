import React from 'react';

interface AnimatedBackgroundProps {
  hidden?: boolean;
}

const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({ hidden }) => {
  return (
    <div
      className={`absolute inset-0 -z-10 overflow-hidden transition-opacity duration-500 ${
        hidden ? 'opacity-0' : 'opacity-100'
      }`}
      aria-hidden
    >
      <div className="absolute inset-0 bg-[#02040a]" />

      <div
        className="absolute -inset-[10%] animate-matrix-gradient opacity-80"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(5, 90, 60, 0.5), transparent 55%), radial-gradient(circle at 80% 30%, rgba(7, 110, 125, 0.6), transparent 60%), radial-gradient(circle at 50% 75%, rgba(150, 210, 40, 0.45), transparent 65%)',
          filter: 'blur(50px)',
        }}
      />

      <div
        className="absolute inset-0 animate-matrix-grid opacity-40 mix-blend-screen"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0, 255, 170, 0.18) 1px, transparent 0), linear-gradient(90deg, rgba(0, 220, 180, 0.12) 1px, transparent 0)',
          backgroundSize: '120px 120px',
        }}
      />

      <div
        className="absolute inset-0 animate-matrix-rain opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(180deg, rgba(5, 255, 180, 0) 0%, rgba(5, 255, 180, 0.2) 60%, rgba(5, 255, 180, 0) 100%)',
          backgroundSize: '8px 180px',
          maskImage: 'radial-gradient(circle at 50% 50%, rgba(0,0,0,0.9), transparent 70%)',
        }}
      />

      <div
        className="absolute inset-0 animate-matrix-noise opacity-25"
        style={{
          backgroundImage:
            'radial-gradient(rgba(0, 255, 200, 0.1) 1px, transparent 0)',
          backgroundSize: '3px 3px',
        }}
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_55%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/80" />
    </div>
  );
};

export default AnimatedBackground;
