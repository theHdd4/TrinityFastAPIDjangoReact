import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BarChart3, Target, Zap, Plus, ArrowRight, Search, TrendingUp, Brain, Users, ShoppingCart, LineChart, PieChart, Database, Sparkles } from 'lucide-react';
import Header from '@/components/Header';
import GreenGlyphRain from '@/components/animations/GreenGlyphRain';
import { REGISTRY_API } from '@/lib/api';
import { LOGIN_ANIMATION_TOTAL_DURATION } from '@/constants/loginAnimation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface BackendApp {
  id: number;
  slug: string;
}

interface UseCaseApp {
  id: number;
  name: string;
  slug: string;
  description: string;
  modules: string[];
  molecules: string[];
  molecule_atoms: Record<string, any>;
  atoms_in_molecules: string[];
}

const Apps = () => {
  const navigate = useNavigate();
  const [appMap, setAppMap] = useState<Record<string, number>>({});
  const [apps, setApps] = useState<UseCaseApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [playIntro, setPlayIntro] = useState(false);
  const [introBaseDelay, setIntroBaseDelay] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const { isAuthenticated, user } = useAuth();

  useEffect(() => {
    const loadApps = async () => {
      // Check if user is authenticated first
      if (!isAuthenticated || !user) {
        console.log('❌ User not authenticated, skipping apps fetch');
        setLoading(false);
        return;
      }

      console.log('🔍 Fetching tenant-accessible apps from registry API...');
      console.log('🔗 API URL:', `${REGISTRY_API}/apps/`);
      console.log('👤 User:', user.username);
      setLoading(true);
      try {
        // Fetch apps from registry API (tenant-specific, filtered by access)
        const registryRes = await fetch(`${REGISTRY_API}/apps/`, { 
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        console.log('📊 Registry apps response status:', registryRes.status);
        console.log('📊 Registry apps response headers:', Object.fromEntries(registryRes.headers.entries()));
        
        if (registryRes.ok) {
          const registryData = await registryRes.json();
          console.log('✅ Loaded tenant apps:', registryData);
          console.log('📱 Number of apps:', registryData.length);
          
          // The registry API now returns enriched data with molecules and atoms
          if (Array.isArray(registryData)) {
            setApps(registryData);
            
            // Build app map for navigation
            const map: Record<string, number> = {};
            registryData.forEach((a: any) => {
              map[a.slug] = a.id;
            });
            setAppMap(map);
            console.log('🗺️ App map created:', map);
          } else {
            console.log('❌ Response is not an array:', typeof registryData);
          }
        } else {
          const text = await registryRes.text();
          console.log('❌ Failed to load tenant apps:', text);
          
          // If 403, the session might be expired
          if (registryRes.status === 403) {
            console.log('🔄 Session expired, redirecting to login...');
            // The AuthContext will handle this automatically
          }
        }
      } catch (err) {
        console.log('💥 Apps fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadApps();
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = sessionStorage.getItem('trinity-login-anim');
    if (!stored) {
      return;
    }

    sessionStorage.removeItem('trinity-login-anim');

    try {
      const meta = JSON.parse(stored) as {
        startedAt?: number;
        totalDuration?: number;
      };
      if (meta && typeof meta.startedAt === 'number') {
        const total =
          typeof meta.totalDuration === 'number'
            ? meta.totalDuration
            : LOGIN_ANIMATION_TOTAL_DURATION;
        const elapsed = Date.now() - meta.startedAt;
        const remaining = Math.max(0, total - elapsed) / 1000;
        setIntroBaseDelay(remaining);
        setPlayIntro(true);
        return;
      }
    } catch (err) {
      console.log('Login intro metadata parse error', err);
    }

    setPlayIntro(true);
    setIntroBaseDelay(0);
  }, []);

  const handleAppSelect = async (appId: string) => {
    let backendId = appMap[appId];
    if (!backendId) {
      try {
        const res = await fetch(`${REGISTRY_API}/apps/`, { credentials: 'include' });
        if (res.ok) {
          const data: BackendApp[] = await res.json();
          const map: Record<string, number> = {};
          data.forEach((a) => {
            map[a.slug] = a.id;
          });
          setAppMap(map);
          backendId = map[appId];
        }
      } catch {
        /* ignore */
      }
    }

    if (!backendId) return;

    localStorage.setItem('current-app', JSON.stringify({ id: backendId, slug: appId }));
    try {
      const res = await fetch(`${REGISTRY_API}/apps/${backendId}/`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.environment) {
          console.log('Environment after app select', data.environment);
          const env = {
            ...data.environment,
            APP_NAME: appId,
            APP_ID: backendId.toString(),
          };
          localStorage.setItem('env', JSON.stringify(env));
        } else {
          localStorage.setItem(
            'env',
            JSON.stringify({ APP_NAME: appId, APP_ID: backendId.toString() })
          );
        }
      }
    } catch (err) {
      console.log('App select env fetch error', err);
    }
    navigate(`/projects?app=${appId}`);
  };

  const categories = [
    { id: 'all', label: 'All Applications', icon: Sparkles },
    { id: 'marketing', label: 'Marketing', icon: Target },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'business', label: 'Business Intelligence', icon: TrendingUp },
    { id: 'ml', label: 'Machine Learning', icon: Brain },
  ];

  // Icon mapping for apps
  const getAppIcon = (slug: string) => {
    const iconMap: Record<string, any> = {
      'marketing-mix': Target,
      'forecasting': LineChart,
      'promo-effectiveness': Zap,
      'exploratory-data-analysis': PieChart,
      'customer-segmentation': Users,
      'demand-forecasting': TrendingUp,
      'price-optimization': ShoppingCart,
      'churn-prediction': Brain,
      'data-integration': Database,
      'blank': Plus,
      'customer-analytics': BarChart3,
    };
    return iconMap[slug] || Target;
  };

  // Color mapping for apps
  const getAppColor = (slug: string) => {
    const colorMap: Record<string, string> = {
      'marketing-mix': 'bg-blue-600',
      'forecasting': 'bg-green-600',
      'promo-effectiveness': 'bg-orange-600',
      'exploratory-data-analysis': 'bg-purple-600',
      'customer-segmentation': 'bg-indigo-600',
      'demand-forecasting': 'bg-emerald-600',
      'price-optimization': 'bg-rose-600',
      'churn-prediction': 'bg-amber-600',
      'data-integration': 'bg-cyan-600',
      'blank': 'bg-slate-600',
      'customer-analytics': 'bg-violet-600',
    };
    return colorMap[slug] || 'bg-gray-600';
  };

  // Category mapping for apps
  const getAppCategory = (slug: string) => {
    const categoryMap: Record<string, string> = {
      'marketing-mix': 'marketing',
      'promo-effectiveness': 'marketing',
      'forecasting': 'analytics',
      'exploratory-data-analysis': 'analytics',
      'data-integration': 'analytics',
      'customer-analytics': 'analytics',
      'demand-forecasting': 'business',
      'price-optimization': 'business',
      'customer-segmentation': 'ml',
      'churn-prediction': 'ml',
      'blank': 'all',
    };
    return categoryMap[slug] || 'analytics';
  };

  // Transform database apps to display format
  const displayApps = apps.map(app => ({
    id: app.slug,
    title: app.name,
    description: app.description,
    icon: getAppIcon(app.slug),
    color: getAppColor(app.slug),
    category: getAppCategory(app.slug),
    featured: ['marketing-mix', 'forecasting', 'promo-effectiveness'].includes(app.slug),
    custom: app.slug === 'blank',
    modules: app.modules || [],
    molecules: app.molecules || [],
    atoms_in_molecules: app.atoms_in_molecules || []
  }));

  const filteredApps = displayApps.filter(app => {
    const matchesSearch = app.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         app.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || app.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const featuredApps = filteredApps.filter(app => app.featured);
  const customApps = filteredApps.filter(app => app.custom);
  const otherApps = filteredApps.filter(app => !app.featured && !app.custom);

  const animationStyle = (offset: number) => ({
    animationDelay: `${(introBaseDelay + offset).toFixed(1)}s`,
    animationFillMode: 'both' as const,
    ...(playIntro ? { opacity: 0 } : {}),
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-background to-secondary/20">
      {/* Background Animation */}
      <div
        className="pointer-events-none absolute inset-0 z-0 animate-fade-in"
        style={animationStyle(0)}
      >
        <GreenGlyphRain className="pointer-events-none opacity-90" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Header */}
        <div className="animate-slide-in-from-top" style={animationStyle(0.2)}>
          <Header />
        </div>

        <ScrollArea className="h-[calc(100vh-80px)]">
          <div className="max-w-7xl mx-auto px-6 py-8 pb-20">
            {/* Hero Section */}
            <div className="text-center mb-8 animate-fade-in" style={animationStyle(0.4)}>
              <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                Choose Your Analytics Application
              </h2>
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-8">
                Powerful pre-configured applications for every analytics need. Select your use case and start building insights immediately.
              </p>

              {/* Loading State */}
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <span className="ml-3 text-muted-foreground">Loading applications...</span>
                </div>
              )}

              {/* Search Bar */}
              {!loading && (
                <div className="max-w-2xl mx-auto mb-8 animate-scale-in" style={animationStyle(0.6)}>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search applications..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-12 pr-4 py-6 text-lg bg-card border-2 border-border focus:border-primary transition-all shadow-sm"
                    />
                  </div>
                </div>
              )}

              {/* Category Filters */}
              {!loading && (
                <div className="flex flex-wrap justify-center gap-3 mb-8 animate-scale-in" style={animationStyle(0.8)}>
                  {categories.map((category) => {
                    const CategoryIcon = category.icon;
                    return (
                      <Button
                        key={category.id}
                        variant={selectedCategory === category.id ? 'default' : 'outline'}
                        onClick={() => setSelectedCategory(category.id)}
                        className={cn(
                          "hover-scale transition-all",
                          selectedCategory === category.id && "shadow-lg"
                        )}
                      >
                        <CategoryIcon className="w-4 h-4 mr-2" />
                        {category.label}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Featured Apps */}
            {!loading && featuredApps.length > 0 && (
              <div className="mb-12 animate-fade-in" style={animationStyle(1.0)}>
                <div className="flex items-center gap-2 mb-6">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h3 className="text-2xl font-bold text-foreground">Featured Applications</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {featuredApps.map((app, index) => {
                    const Icon = app.icon;
                    return (
                      <Card 
                        key={app.id}
                        className="group relative bg-card border-2 border-border hover:border-primary/50 hover:shadow-2xl transition-all duration-300 overflow-hidden hover-scale cursor-pointer animate-scale-in"
                        style={animationStyle(1.1 + index * 0.1)}
                        onClick={() => handleAppSelect(app.id)}
                      >
                        {/* Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        
                        <div className="relative p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div className={`${app.color} w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                              <Icon className="w-7 h-7 text-white" />
                            </div>
                            <Badge variant="secondary" className="bg-primary/10 text-primary">
                              Featured
                            </Badge>
                          </div>
                          
                          <h3 className="text-xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
                            {app.title}
                          </h3>
                          <p className="text-muted-foreground text-sm leading-relaxed mb-4 line-clamp-2">
                            {app.description}
                          </p>
                          
                          {app.modules.length > 0 && (
                            <div className="mb-4">
                              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Includes:</p>
                              <div className="flex flex-wrap gap-1.5">
                                {app.modules.slice(0, 3).map((module, idx) => (
                                  <Badge 
                                    key={idx}
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    {module}
                                  </Badge>
                                ))}
                                {app.modules.length > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{app.modules.length - 3}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}
                          
                          <Button 
                            variant="ghost"
                            className="w-full justify-between group-hover:bg-primary/5 group-hover:text-primary transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAppSelect(app.id);
                            }}
                          >
                            Get Started
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Custom Applications */}
            {!loading && customApps.length > 0 && (
              <div className="mb-12 animate-fade-in" style={animationStyle(1.4)}>
                <div className="flex items-center gap-2 mb-6">
                  <Plus className="w-5 h-5 text-primary" />
                  <h3 className="text-2xl font-bold text-foreground">Custom Applications</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {customApps.map((app, index) => {
                    const Icon = app.icon;
                    return (
                      <Card 
                        key={app.id}
                        className="group relative bg-card border-2 border-dashed border-border hover:border-primary/50 hover:shadow-xl transition-all duration-300 overflow-hidden hover-scale cursor-pointer animate-scale-in"
                        style={animationStyle(1.5 + index * 0.1)}
                        onClick={() => handleAppSelect(app.id)}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        
                        <div className="relative p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div className={`${app.color} w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                              <Icon className="w-7 h-7 text-white" />
                            </div>
        </div>

                          <h3 className="text-xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
                            {app.title}
                          </h3>
                          <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                            {app.description}
                          </p>
                          
                          <Button 
                            variant="ghost"
                            className="w-full justify-between group-hover:bg-primary/5 group-hover:text-primary transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAppSelect(app.id);
                            }}
                          >
                            Get Started
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* All Other Apps */}
            {!loading && otherApps.length > 0 && (
              <div className="animate-fade-in" style={animationStyle(1.6)}>
                <h3 className="text-2xl font-bold text-foreground mb-6">All Applications</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {otherApps.map((app, index) => {
            const Icon = app.icon;
            return (
              <Card
                key={app.id}
                        className="group bg-card border border-border hover:border-primary/50 hover:shadow-xl transition-all duration-300 hover-scale cursor-pointer animate-scale-in"
                        style={animationStyle(1.7 + index * 0.05)}
                onClick={() => handleAppSelect(app.id)}
              >
                        <div className="p-6">
                          <div className="flex items-start gap-4 mb-4">
                            <div className={`${app.color} w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-110 transition-transform duration-300`}>
                              <Icon className="w-6 h-6 text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                              <h3 className="text-lg font-bold text-foreground mb-1 group-hover:text-primary transition-colors">
                        {app.title}
                      </h3>
                              <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2">
                                {app.description}
                              </p>
                            </div>
                          </div>
                          
                          {app.modules.length > 0 && (
                        <div className="mb-4">
                              <div className="flex flex-wrap gap-1.5">
                                {app.modules.slice(0, 2).map((module, idx) => (
                                  <Badge 
                                    key={idx}
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {module}
                                  </Badge>
                                ))}
                                {app.modules.length > 2 && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{app.modules.length - 2}
                                  </Badge>
                                )}
                          </div>
                        </div>
                      )}

                          <Button 
                            variant="ghost"
                            size="sm"
                            className="w-full justify-between text-sm group-hover:bg-primary/5 group-hover:text-primary transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAppSelect(app.id);
                            }}
                          >
                            Select
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                          </Button>
                </div>
              </Card>
            );
          })}
        </div>
              </div>
            )}

            {/* No Results */}
            {!loading && filteredApps.length === 0 && (
              <div className="text-center py-20 animate-fade-in">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-secondary/50 flex items-center justify-center">
                  <Search className="w-10 h-10 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">No applications found</h3>
                <p className="text-muted-foreground">Try adjusting your search or filter criteria</p>
              </div>
            )}

            {/* Footer Quote */}
            <div
              className="mt-16 text-center text-sm text-muted-foreground animate-fade-in"
              style={animationStyle(2.0)}
            >
              "The Matrix has you" – pick your path
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default Apps;
