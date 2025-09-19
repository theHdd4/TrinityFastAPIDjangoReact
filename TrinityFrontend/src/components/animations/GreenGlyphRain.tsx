import React, { useEffect, useRef } from 'react';

interface GreenGlyphRainProps {
  className?: string;
}

const GreenGlyphRain: React.FC<GreenGlyphRainProps> = ({ className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const maskStyle: React.CSSProperties = {
    maskImage:
      'linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.15) 20%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.75) 80%, rgba(0,0,0,0.9) 100%)',
    WebkitMaskImage:
      'linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.15) 20%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.75) 80%, rgba(0,0,0,0.9) 100%)',
  };

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) {
      return undefined;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return undefined;
    }

    const fontSize = 16;
    const characters = '0101010011010010110100100110100101010010';
    let width = 0;
    let height = 0;
    let columns = 0;
    let drops: number[] = [];

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = canvas.width = rect.width;
      height = canvas.height = rect.height;
      columns = Math.max(1, Math.floor(width / fontSize));
      drops = Array.from({ length: columns }, () => Math.floor(Math.random() * -50));
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const draw = () => {
      ctx.fillStyle = 'rgba(10, 26, 15, 0.08)';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#16a34a';
      ctx.textAlign = 'center';
      ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;

      for (let i = 0; i < drops.length; i++) {
        const text = characters[Math.floor(Math.random() * characters.length)];
        const x = i * fontSize + fontSize / 2;
        const y = drops[i] * fontSize;

        ctx.fillText(text, x, y);

        if (y > height && Math.random() > 0.96) {
          drops[i] = 0;
        } else {
          drops[i] += 1;
        }
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden ${className}`}
      style={maskStyle}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-white/90 via-white/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/80 via-emerald-900/50 to-transparent" />
    </div>
  );
};

export default GreenGlyphRain;
