
import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, User, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import AnimatedLogo from '@/components/PrimaryMenu/TrinityAssets/AnimatedLogo';
import LoginAnimation from '@/components/LoginAnimation';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleAnimationComplete = useCallback(() => {
    sessionStorage.setItem('trinity-login-anim', '1');
    navigate('/apps');
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    console.log('Submitting login form for', username);

    const success = await login(username, password);
    if (success) {
      setShowAnimation(true);
    } else {
      setError('Invalid credentials.');
      console.log('Login failed for', username);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <LoginAnimation active={showAnimation} onComplete={handleAnimationComplete} />
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source src="/background.mp4" type="video/mp4" />
      </video>
      <div className="w-full max-w-md space-y-6 relative z-10">
        <Card className="bg-white/5 backdrop-blur-lg border border-white/10 text-white shadow-2xl">
          <CardHeader className="flex flex-col items-center space-y-2 text-center">
            <AnimatedLogo className="w-20 h-20 drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
            <CardTitle className="text-4xl font-bold font-mono">
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
