import React, { useEffect, useRef } from 'react';

interface LoadingAnimationProps {
  message?: string;
  className?: string;
}

const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
  message = 'Processing data...',
  className = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const getVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const primary = `hsl(${getVar('--primary')})`;
    const primaryGlow = `hsl(${getVar('--primary')})`;
    const backgroundHsl = getVar('--background');

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const fontSize = 16; // px
    const columns = Math.floor(width / fontSize);
    const drops: number[] = Array.from({ length: columns }, () => Math.floor(Math.random() * -50));

    const chars = '0101010011010010110100100110100101010010';

    const draw = () => {
      // Trail effect background using theme background token
      ctx.fillStyle = backgroundHsl ? `hsla(${backgroundHsl}, 0.08)` : 'rgba(0,0,0,0.08)';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = primary; // matrix glyph color
      ctx.textAlign = 'center';
      ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;

      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize + fontSize / 2;
        const y = drops[i] * fontSize;

        // subtle glow for head
        if (Math.random() < 0.05) {
          ctx.shadowColor = primaryGlow;
          ctx.shadowBlur = 12;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.fillText(text, x, y);

        if (y > height && Math.random() > 0.965) {
          drops[i] = 0;
        } else {
          drops[i]++;
        }
      }

      rafRef.current = requestAnimationFrame(draw);
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
  }, []);

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm ${className}`}>
      {/* Matrix rain canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Message */}
      <div className="relative z-10 text-center px-6">
        <h3 className="text-2xl font-light text-foreground mb-2">{message}</h3>
        <div className="flex items-center justify-center space-x-1 text-muted-foreground">
          <span>Please wait</span>
          <span className="animate-pulse">.</span>
          <span className="animate-pulse animation-delay-300">.</span>
          <span className="animate-pulse animation-delay-600">.</span>
        </div>
      </div>

      <style>{`
        .animation-delay-300 { animation-delay: 300ms; }
        .animation-delay-600 { animation-delay: 600ms; }
      `}</style>
    </div>
  );
};

export default LoadingAnimation;
