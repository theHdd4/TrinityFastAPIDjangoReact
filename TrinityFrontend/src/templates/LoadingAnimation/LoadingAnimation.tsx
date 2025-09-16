import React, { useEffect, useRef } from 'react';

interface LoadingAnimationProps {
  status?: string;
  className?: string;
}

const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
  status = '',
  className = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fontSize = 16;
    const chars = '0101010011010010110100100110100101010010';
    let width = 0;
    let height = 0;
    let columns = 0;
    let drops: number[] = [];

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      width = canvas.width = rect.width;
      height = canvas.height = rect.height;
      columns = Math.floor(width / fontSize);
      drops = Array.from({ length: columns }, () => Math.floor(Math.random() * -50));
    };

    resize();
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    const draw = () => {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#00a000';
      ctx.textAlign = 'center';
      ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;

      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize + fontSize / 2;
        const y = drops[i] * fontSize;

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

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
  }, []);

  return (
    <div className={`absolute inset-0 flex items-center justify-center bg-white ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="relative z-10 text-center px-6">
        <div className="inline-flex flex-col items-center px-6 py-4 border border-white/60 rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.35)]">
          <h3
            className="text-2xl font-light text-black mb-2"
            style={{ textShadow: '0 0 8px rgba(255, 255, 255, 0.6)' }}
          >
            Loading
          </h3>
          <div
            className="flex items-center justify-center space-x-1 text-black"
            style={{ textShadow: '0 0 8px rgba(255, 255, 255, 0.6)' }}
          >
            <span>{status}</span>
            <span className="animate-pulse">.</span>
            <span className="animate-pulse animation-delay-300">.</span>
            <span className="animate-pulse animation-delay-600">.</span>
          </div>
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
