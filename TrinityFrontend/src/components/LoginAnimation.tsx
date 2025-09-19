import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LOGIN_ANIMATION_CURTAIN_DELAY,
  LOGIN_ANIMATION_CURTAIN_DURATION,
  LOGIN_ANIMATION_EXIT_FADE,
} from '@/constants/loginAnimation';

interface LoginAnimationProps {
  active: boolean;
  onComplete: () => void;
}

const STATUS_SEQUENCE = ['Authenticating', 'Fetching User Data'];
const FINAL_STATUS = 'Creating your personalized dashboard';

const LoginAnimation: React.FC<LoginAnimationProps> = ({ active, onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const timeoutsRef = useRef<number[]>([]);
  const [status, setStatus] = useState('');
  const [statusMode, setStatusMode] = useState<'matrix' | 'light'>('matrix');
  const [curtainVisible, setCurtainVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  const chars = useMemo(() => ['0', '1'], []);

  useEffect(() => {
    if (!active || !canvasRef.current) {
      return undefined;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return undefined;
    }

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops: number[] = Array.from({ length: columns }, () => Math.random() * -100);

    const draw = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#00ff41';
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        ctx.fillText(text, x, y);

        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }

        drops[i] += 1;
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [active, chars]);

  useEffect(() => {
    timeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    timeoutsRef.current = [];

    if (!active) {
      setStatus('');
      setStatusMode('matrix');
      setCurtainVisible(false);
      setExiting(false);
      return undefined;
    }

    setStatus(STATUS_SEQUENCE[0]);
    setStatusMode('matrix');
    setCurtainVisible(false);
    setExiting(false);

    const curtainExitTrigger =
      LOGIN_ANIMATION_CURTAIN_DELAY + LOGIN_ANIMATION_CURTAIN_DURATION;

    timeoutsRef.current.push(
      window.setTimeout(() => {
        setStatus(STATUS_SEQUENCE[1]);
      }, 850)
    );

    timeoutsRef.current.push(
      window.setTimeout(() => {
        setCurtainVisible(true);
        timeoutsRef.current.push(
          window.setTimeout(() => {
            setStatus(FINAL_STATUS);
            setStatusMode('light');
          }, 350)
        );
      }, LOGIN_ANIMATION_CURTAIN_DELAY)
    );

    timeoutsRef.current.push(
      window.setTimeout(() => {
        setExiting(true);
        timeoutsRef.current.push(
          window.setTimeout(() => {
            onComplete();
          }, LOGIN_ANIMATION_EXIT_FADE)
        );
      }, curtainExitTrigger)
    );

    return () => {
      timeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
      timeoutsRef.current = [];
    };
  }, [active, onComplete]);

  if (!active) {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 z-[1000] overflow-hidden transition-opacity duration-500 ${
        exiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="absolute inset-0 bg-black/70">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
        <div className="text-center">
          <div
            className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-full border border-green-500/40 bg-green-500/10 backdrop-blur"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" className="text-green-400">
              <g fill="currentColor">
                <polygon points="12,3 15,8 9,8" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <polygon points="7,12 10,17 4,17" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <polygon points="17,12 20,17 14,17" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="12" cy="12" r="2" fill="currentColor" />
              </g>
            </svg>
          </div>

          <div
            className="animate-fade-out-fast"
            style={{ animationDelay: '0.4s', animationFillMode: 'forwards' }}
          >
            <h2 className="mb-2 font-mono text-2xl tracking-[0.35em] text-green-400">
              ACCESS GRANTED
            </h2>
            <p className="font-mono text-sm text-green-300/80">Welcome to Trinity</p>
          </div>

          <div className="mt-10 flex justify-center">
            <div
              className={`rounded-lg px-6 py-3 font-mono text-sm tracking-[0.2em] transition-all duration-500 ${
                statusMode === 'matrix'
                  ? 'border border-green-400/30 bg-black/60 text-green-300 shadow-[0_0_30px_rgba(0,255,65,0.2)]'
                  : 'border border-black/5 bg-white/90 text-gray-900 shadow-[0_20px_60px_rgba(15,23,42,0.15)]'
              }`}
            >
              {status}
            </div>
          </div>
        </div>
      </div>

      <div
        className={`absolute inset-0 z-20 flex items-start justify-center bg-gradient-to-b from-white/95 via-white/60 to-white/10 backdrop-blur-md ${
          curtainVisible ? 'animate-slide-up-cover shadow-[0_-30px_70px_rgba(15,23,42,0.28)]' : 'translate-y-full'
        }`}
      >
        <div className="mt-24 h-1 w-20 rounded-full bg-gray-200/80 shadow-[0_10px_28px_rgba(15,23,42,0.2)]" />
      </div>
    </div>
  );
};

export default LoginAnimation;
