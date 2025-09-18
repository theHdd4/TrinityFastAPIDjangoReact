import React, { useEffect, useRef } from 'react';

interface LoginAnimationProps {
  loginSuccess: boolean;
}

const LoginAnimation: React.FC<LoginAnimationProps> = ({ loginSuccess }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Enhanced Matrix animation effect for success state
  useEffect(() => {
    if (!loginSuccess) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const fontSize = 14;
    const columns = Math.floor(width / fontSize);
    const drops: number[] = Array.from({ length: columns }, () => Math.floor(Math.random() * -100));
    const speeds: number[] = Array.from({ length: columns }, () => 0.5 + Math.random() * 0.8);
    const glowIntensity: number[] = Array.from({ length: columns }, () => Math.random());

    const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
    let frame = 0;
    
    const draw = () => {
      frame++;
      const progress = Math.min(frame / 150, 1); // Extended to 2.5 seconds for smoother transition
      
      // Enhanced dissipating background with elegant fade
      const backgroundOpacity = Math.max(0, 0.12 * Math.pow(1 - progress, 2));
      ctx.fillStyle = `rgba(0, 0, 0, ${backgroundOpacity})`;
      ctx.fillRect(0, 0, width, height);

      // Add subtle particle effects
      if (frame % 3 === 0 && progress < 0.8) {
        for (let i = 0; i < 3; i++) {
          const particleX = Math.random() * width;
          const particleY = Math.random() * height;
          const particleSize = Math.random() * 2 + 1;
          const particleOpacity = Math.random() * 0.3 * (1 - progress);
          
          ctx.save();
          ctx.globalAlpha = particleOpacity;
          ctx.fillStyle = progress < 0.5 ? '#FFBD59' : '#41C185';
          ctx.beginPath();
          ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      ctx.textAlign = 'center';
      ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

      for (let i = 0; i < drops.length; i += 1) { // Restore full density for fancier effect
        const text = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize + fontSize / 2;
        const y = drops[i] * fontSize;

        // Enhanced color transition with smoother interpolation
        const yellowComponent = Math.pow(1 - progress, 1.5);
        const greenComponent = Math.pow(progress, 0.8);
        
        // Smoother interpolation between trinity-yellow (#FFBD59) and trinity-green (#41C185)
        const r = Math.floor(255 * yellowComponent + 65 * greenComponent);
        const g = Math.floor(189 * yellowComponent + 193 * greenComponent);
        const b = Math.floor(89 * yellowComponent + 133 * greenComponent);
        
        // Enhanced character opacity with wave effect
        const waveEffect = Math.sin(frame * 0.02 + i * 0.1) * 0.1;
        const baseOpacity = Math.max(0, 0.6 - progress * 0.4 + waveEffect);
        const charOpacity = baseOpacity * (0.8 + glowIntensity[i] * 0.4);
        
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${charOpacity})`;
        
        // Enhanced glow effects with varying intensity
        if (glowIntensity[i] > 0.7) {
          ctx.save();
          ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${charOpacity * 0.9})`;
          ctx.shadowBlur = 12 + Math.sin(frame * 0.03 + i) * 3;
          ctx.fillText(text, x, y);
          ctx.restore();
        } else if (Math.random() < 0.08) {
          ctx.save();
          ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${charOpacity * 0.6})`;
          ctx.shadowBlur = 6;
          ctx.fillText(text, x, y);
          ctx.restore();
        } else {
          ctx.shadowBlur = 0;
          ctx.fillText(text, x, y);
        }

        // Variable speed drops for more dynamic movement
        if (y > height && Math.random() > 0.975) {
          drops[i] = Math.floor(Math.random() * -50);
          speeds[i] = 0.5 + Math.random() * 0.8;
          glowIntensity[i] = Math.random();
        } else {
          drops[i] += speeds[i]; // Variable speed
        }
      }

      // Continue animation longer for smoother transition
      if (frame < 150) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };

    rafRef.current = requestAnimationFrame(draw);

    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
    };
  }, [loginSuccess]);

  if (!loginSuccess) return null;

  return (
    <div className="absolute inset-0 z-50 bg-black animate-fade-out-enhanced" 
         style={{ 
           animationDelay: '2.0s', 
           animationDuration: '1.2s', 
           animationFillMode: 'forwards',
           background: 'linear-gradient(135deg, rgba(0,0,0,0.98), rgba(0,0,0,0.95))'
         }}>
      {/* Enhanced Matrix Rain Canvas with glow effect */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" 
              style={{ filter: 'blur(0.3px) brightness(1.1)' }} />
      
      {/* Success Message Overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center space-y-6 animate-fade-in" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
          
          {/* Trinity Logo with subtle effect */}
          <div className="relative mx-auto w-20 h-20">
            <div className="absolute inset-0 rounded-full border border-trinity-green/40 animate-pulse opacity-60"></div>
            <div className="relative w-full h-full rounded-full bg-black/60 border border-trinity-green/60 flex items-center justify-center backdrop-blur-sm">
              <svg width="28" height="28" viewBox="0 0 24 24" className="text-trinity-yellow">
                <defs>
                  <linearGradient id="matrixSuccessGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FFBD59" stopOpacity="0.9"/>
                    <stop offset="100%" stopColor="#41C185" stopOpacity="0.7"/>
                  </linearGradient>
                </defs>
                <g fill="url(#matrixSuccessGradient)">
                  <polygon points="12,3 15,8 9,8" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.8"/>
                  <polygon points="7,12 10,17 4,17" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.8"/>
                  <polygon points="17,12 20,17 14,17" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.8"/>
                  <circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.9"/>
                </g>
              </svg>
            </div>
          </div>

          {/* Elegant Success Text */}
          <div className="space-y-3 animate-scale-in" style={{ animationDelay: '0.6s', animationFillMode: 'both' }}>
            <h2 className="text-2xl font-mono text-trinity-green tracking-wide opacity-90">
              ACCESS GRANTED
            </h2>
            <div className="space-y-1">
              <p className="text-trinity-yellow font-mono text-sm opacity-80">
                Welcome to Trinity
              </p>
              <p className="text-trinity-yellow/60 font-mono text-xs">
                Initializing workspace...
              </p>
            </div>
          </div>

          {/* Subtle Loading Indicator */}
          <div className="flex justify-center space-x-1 animate-fade-in" style={{ animationDelay: '0.9s', animationFillMode: 'both' }}>
            <div className="w-2 h-2 bg-trinity-green/70 rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-trinity-green/70 rounded-full animate-pulse" style={{ animationDelay: '0.15s' }}></div>
            <div className="w-2 h-2 bg-trinity-green/70 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginAnimation;
