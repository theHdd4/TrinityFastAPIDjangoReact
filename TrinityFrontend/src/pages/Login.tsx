
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, User, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import AnimatedLogo from '@/components/PrimaryMenu/TrinityAssets/AnimatedLogo';
import { BackToAppsIcon } from '@/components/PrimaryMenu/TrinityAssets';
import LoginAnimation from '@/components/LoginAnimation';
import { LOGIN_ANIMATION_TOTAL_DURATION } from '@/constants/loginAnimation';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const [loginSuccessful, setLoginSuccessful] = useState(false);
  const [animationCompleted, setAnimationCompleted] = useState(false);
  const animationStartRef = useRef<number | null>(null);
  const animationCompletionMetaRef = useRef<{
    startedAt: number;
    totalDuration: number;
    completedAt: number;
  } | null>(null);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleAnimationComplete = useCallback(() => {
    const startedAt = animationStartRef.current ?? Date.now();
    const totalDuration = LOGIN_ANIMATION_TOTAL_DURATION;
    const completedAt = Date.now();

    animationCompletionMetaRef.current = {
      startedAt,
      totalDuration,
      completedAt,
    };
    animationStartRef.current = null;
    setAnimationCompleted(true);
  }, []);

  const finalizeNavigation = useCallback(() => {
    let meta = animationCompletionMetaRef.current;

    if (!meta && animationStartRef.current) {
      meta = {
        startedAt: animationStartRef.current,
        totalDuration: LOGIN_ANIMATION_TOTAL_DURATION,
        completedAt: Date.now(),
      };
    }

    if (!meta) {
      const stored = sessionStorage.getItem('trinity-login-anim');
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as {
            startedAt?: number;
            totalDuration?: number;
          };
          if (typeof parsed.startedAt === 'number') {
            meta = {
              startedAt: parsed.startedAt,
              totalDuration:
                typeof parsed.totalDuration === 'number'
                  ? parsed.totalDuration
                  : LOGIN_ANIMATION_TOTAL_DURATION,
              completedAt: Date.now(),
            };
          }
        } catch {
          meta = null;
        }
      }
    }

    if (meta) {
      sessionStorage.setItem('trinity-login-anim', JSON.stringify(meta));
    } else {
      sessionStorage.removeItem('trinity-login-anim');
    }

    animationCompletionMetaRef.current = null;
    animationStartRef.current = null;
    setIsLoading(false);
    navigate('/apps', { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (loginSuccessful && animationCompleted) {
      finalizeNavigation();
    }
  }, [animationCompleted, finalizeNavigation, loginSuccessful]);

  useEffect(() => {
    if (loginSuccessful && !showAnimation) {
      finalizeNavigation();
    }
  }, [finalizeNavigation, loginSuccessful, showAnimation]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setLoginSuccessful(false);
    setAnimationCompleted(false);
    animationCompletionMetaRef.current = null;

    const success = await login(username, password, {
      onInitialSuccess: () => {
        const startedAt = Date.now();
        animationStartRef.current = startedAt;
        sessionStorage.setItem(
          'trinity-login-anim',
          JSON.stringify({ startedAt, totalDuration: LOGIN_ANIMATION_TOTAL_DURATION })
        );
        setShowAnimation(true);
      },
    });

    if (success) {
      setLoginSuccessful(true);
      if (!animationStartRef.current) {
        const startedAt = Date.now();
        animationStartRef.current = startedAt;
        sessionStorage.setItem(
          'trinity-login-anim',
          JSON.stringify({ startedAt, totalDuration: LOGIN_ANIMATION_TOTAL_DURATION })
        );
        setShowAnimation(true);
      }
    } else {
      setError('Invalid credentials.');
      setIsLoading(false);
      animationStartRef.current = null;
      animationCompletionMetaRef.current = null;
      setShowAnimation(false);
      setAnimationCompleted(false);
      setLoginSuccessful(false);
      sessionStorage.removeItem('trinity-login-anim');
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <LoginAnimation active={showAnimation} onComplete={handleAnimationComplete} />
      
      {/* Back to Home Button */}
      <div
        className={`absolute top-6 left-6 z-20 transition-opacity duration-500 ${
          showAnimation ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="rounded-lg border border-white/10 bg-white/5 backdrop-blur-lg text-white shadow-2xl overflow-hidden">
          <Button
            variant="ghost"
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2 text-[#fec107] hover:text-[#e0ad06] hover:bg-white/10 font-mono font-light transition-colors duration-300 rounded-lg"
          >
            <BackToAppsIcon className="w-4 h-4 text-[#fec107]" />
            Back to Home
          </Button>
        </div>
      </div>
      
      <video
        autoPlay
        loop
        muted
        playsInline
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
          showAnimation ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <source src="/background.mp4" type="video/mp4" />
      </video>
      <div
        className={`relative z-10 w-full max-w-md space-y-6 transition-opacity duration-500 ${
          showAnimation ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      >
        <Card className="bg-white/5 backdrop-blur-lg border border-white/10 text-white shadow-2xl">
          <CardHeader className="flex flex-col items-center space-y-2 text-center">
            <div 
              className="cursor-pointer hover:scale-110 transition-transform duration-300"
              onClick={() => navigate('/')}
            >
              <AnimatedLogo className="w-20 h-20 drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
            </div>
            <CardTitle 
              className="text-4xl font-bold font-mono cursor-pointer hover:text-[#fec107] transition-colors duration-300"
              onClick={() => navigate('/')}
            >
              Trinity
            </CardTitle>
            <CardDescription className="w-40 text-sm text-white/70 tracking-[0.2em] text-center whitespace-nowrap">
              Enter The Matrix
            </CardDescription>
            <div className="h-1 w-40 bg-[#fec107] mt-2"></div>
            <p className="text-xs text-white/60">A Quant Matrix AI Experience</p>
          </CardHeader>

          <CardContent className="space-y-6">
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-xs font-mono font-bold text-white">
                  Username
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-trinity-green w-4 h-4" />
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-white focus:border-trinity-green focus:ring-trinity-green/20 font-mono"
                    placeholder="Enter Username"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-mono font-bold text-white">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-trinity-green w-4 h-4" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 bg-white/5 border-white/20 text-white placeholder:text-white focus:border-trinity-green focus:ring-trinity-green/20 font-mono"
                    placeholder="Enter Password"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0 text-trinity-green hover:text-trinity-blue hover:bg-white/10"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {error && (
                <div className="text-red-400 text-sm font-mono text-center bg-red-500/10 border border-red-500/20 rounded p-2">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#fec107] text-black font-mono font-light transition-all duration-300 hover:bg-[#e0ad06] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                    <span>Accessing...</span>
                  </div>
                ) : (
                  'Access Trinity'
                )}
              </Button>
            </form>

            <div className="text-center">
              <p className="text-xs text-white/70 font-mono">Credentials: Your Official Email / Your Employee ID</p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-6">
          <p className="text-white text-xs">"No one can be told what the Trinity is. You have to see it for yourself"</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
