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

interface BackendApp {
  id: number;
  slug: string;
}

const Apps = () => {
  const navigate = useNavigate();
  const [appMap, setAppMap] = useState<Record<string, number>>({});
  const [playIntro, setPlayIntro] = useState(false);
  const [introBaseDelay, setIntroBaseDelay] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    const loadApps = async () => {
      console.log('Fetching apps from backend...');
      try {
        const res = await fetch(`${REGISTRY_API}/apps/`, { credentials: 'include' });
        console.log('Apps response status', res.status);
        if (res.ok) {
          const data: BackendApp[] = await res.json();
          console.log('Loaded apps', data);
          const map: Record<string, number> = {};
          data.forEach((a) => {
            map[a.slug] = a.id;
          });
          setAppMap(map);
        } else {
          const text = await res.text();
          console.log('Failed to load apps:', text);
        }
      } catch (err) {
        console.log('Apps fetch error', err);
      }
    };

    loadApps();
  }, []);

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

  const apps = [
    {
      id: 'marketing-mix',
      title: 'Marketing Mix Modeling',
      description: 'Optimize marketing spend allocation across different channels and measure incremental impact',
      icon: Target,
      color: 'bg-blue-600',
      category: 'marketing',
      featured: true,
      modules: ['marketing-data-prep', 'marketing-explore', 'mmm-builder']
    },
    {
      id: 'forecasting',
      title: 'Forecasting Analysis',
      description: 'Predict future trends and patterns with advanced time series analysis and modeling',
      icon: LineChart,
      color: 'bg-green-600',
      category: 'analytics',
      featured: true,
      modules: ['time-series-prep', 'forecasting-explore', 'forecast-builder']
    },
    {
      id: 'promo-effectiveness',
      title: 'Promo Effectiveness',
      description: 'Measure and analyze promotional campaign performance and ROI across touchpoints',
      icon: Zap,
      color: 'bg-orange-600',
      category: 'marketing',
      featured: true,
      modules: ['promo-data-prep', 'promo-explore', 'promo-builder']
    },
    {
      id: 'exploratory-data-analysis',
      title: 'Exploratory Data Analysis',
      description: 'Perform comprehensive exploratory data analysis with advanced visualization and statistical insights',
      icon: PieChart,
      color: 'bg-purple-600',
      category: 'analytics',
      featured: false,
      modules: ['eda-data-prep', 'eda-explore', 'eda-visualize']
    },
    {
      id: 'customer-segmentation',
      title: 'Customer Segmentation',
      description: 'Segment customers based on behavior, demographics, and purchase patterns using ML clustering',
      icon: Users,
      color: 'bg-indigo-600',
      category: 'ml',
      featured: false,
      modules: ['segment-prep', 'cluster-analysis', 'segment-profile']
    },
    {
      id: 'demand-forecasting',
      title: 'Demand Forecasting',
      description: 'Predict product demand and inventory requirements with machine learning models',
      icon: TrendingUp,
      color: 'bg-emerald-600',
      category: 'business',
      featured: false,
      modules: ['demand-prep', 'forecast-models', 'inventory-optimizer']
    },
    {
      id: 'price-optimization',
      title: 'Price Optimization',
      description: 'Optimize pricing strategies using elasticity models and competitive intelligence',
      icon: ShoppingCart,
      color: 'bg-rose-600',
      category: 'business',
      featured: false,
      modules: ['price-prep', 'elasticity-model', 'price-simulator']
    },
    {
      id: 'churn-prediction',
      title: 'Churn Prediction',
      description: 'Identify at-risk customers and predict churn probability with ML classification models',
      icon: Brain,
      color: 'bg-amber-600',
      category: 'ml',
      featured: false,
      modules: ['churn-prep', 'feature-engineering', 'churn-model']
    },
    {
      id: 'data-integration',
      title: 'Data Integration Hub',
      description: 'Connect, transform, and consolidate data from multiple sources into unified datasets',
      icon: Database,
      color: 'bg-cyan-600',
      category: 'analytics',
      featured: false,
      modules: ['data-connectors', 'etl-pipeline', 'data-quality']
    },
    {
      id: 'blank',
      title: 'Create Blank App',
      description: 'Start from scratch with a clean canvas and build your custom analysis workflow',
      icon: Plus,
      color: 'bg-slate-600',
      category: 'all',
      featured: false,
      custom: true,
      modules: []
    }
  ];

  const filteredApps = apps.filter(app => {
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

              {/* Search Bar */}
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

              {/* Category Filters */}
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
            </div>

            {/* Featured Apps */}
            {featuredApps.length > 0 && (
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
            {customApps.length > 0 && (
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
            {otherApps.length > 0 && (
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
            {filteredApps.length === 0 && (
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
