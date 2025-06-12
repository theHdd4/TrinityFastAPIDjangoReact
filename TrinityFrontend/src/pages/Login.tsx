
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, User, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import AnimatedLogo from '@/components/AnimatedLogo';
import LogoText from '@/components/LogoText';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    console.log('Submitting login form for', username);

    const success = await login(username, password);
    if (success) {
      navigate('/projects');
    } else {
      setError('Invalid credentials.');
      console.log('Login failed for', username);
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Trinity Logo */}
        <div className="flex flex-col items-center space-y-2">
          <AnimatedLogo className="w-20 h-20" />
          <LogoText
            className="items-center"
            titleClassName="text-4xl text-black"
          />
        </div>


        <Card className="bg-trinity-bg-secondary border-gray-300 shadow">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-3xl font-light text-black font-mono">
              Enter the Matrix
            </CardTitle>
            <CardDescription className="text-black font-light text-sm">
              Access Trinity • Quant Matrix AI
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-black font-mono text-sm">
                  Username
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-trinity-yellow w-4 h-4" />
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10 bg-white border-gray-300 text-black placeholder-gray-500 focus:border-trinity-yellow focus:ring-trinity-yellow/20 font-mono"
                    placeholder="Enter username"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-black font-mono text-sm">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-trinity-yellow w-4 h-4" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 bg-white border-gray-300 text-black placeholder-gray-500 focus:border-trinity-yellow focus:ring-trinity-yellow/20 font-mono"
                    placeholder="Enter password"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 text-trinity-yellow hover:text-trinity-green hover:bg-trinity-yellow/10"
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
                className="w-full bg-trinity-yellow hover:bg-[#FFCF87] text-black font-mono font-medium transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
              <p className="text-black text-xs font-mono">
                Demo Credentials: harsha / harsha
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-8">
          <p className="text-black/50 text-xs">"No one can be told what the Trinity is. You have to see it for yourself"</p>
        </div>
      </div>
    </div>
  );
};

export default Login;