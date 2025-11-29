import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BarChart3, Target, Zap, Plus, ArrowRight, Search, TrendingUp, Brain, Users, ShoppingCart, LineChart, PieChart, Database, Sparkles, Layers, DollarSign, Megaphone, Monitor, LayoutGrid, Clock, Calendar, ChevronRight, GitBranch, FlaskConical, Presentation } from 'lucide-react';
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

interface ModeStatus {
  workflow: boolean;
  laboratory: boolean;
  exhibition: boolean;
}

// Recent projects data
const recentProjects = [
  {
    id: 'proj-1',
    name: 'Q4 Marketing Campaign Analysis',
    appId: 'marketing-mix',
    appTitle: 'Marketing Mix Modeling',
    lastModified: new Date(Date.now() - 2 * 60 * 60 * 1000),
    icon: Target,
    modes: { workflow: true, laboratory: true, exhibition: false },
  },
  {
    id: 'proj-2',
    name: 'Holiday Sales Forecast 2024',
    appId: 'forecasting',
    appTitle: 'Forecasting Analysis',
    lastModified: new Date(Date.now() - 5 * 60 * 60 * 1000),
    icon: LineChart,
    modes: { workflow: true, laboratory: false, exhibition: false },
  },
  {
    id: 'proj-3',
    name: 'Black Friday Promo Impact',
    appId: 'promo-effectiveness',
    appTitle: 'Promo Effectiveness',
    lastModified: new Date(Date.now() - 24 * 60 * 60 * 1000),
    icon: Zap,
    modes: { workflow: true, laboratory: true, exhibition: true },
  },
  {
    id: 'proj-4',
    name: 'Customer Behavior Clusters',
    appId: 'customer-segmentation',
    appTitle: 'Customer Segmentation',
    lastModified: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    icon: Users,
    modes: { workflow: false, laboratory: false, exhibition: false },
  },
];

const formatRelativeTime = (date: Date) => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

// Mode Status Indicator Component
const ModeStatusIndicator = ({ modes }: { modes: ModeStatus }) => {
  const modeItems = [
    { key: 'workflow', label: 'Workflow', icon: GitBranch, configured: modes.workflow },
    { key: 'laboratory', label: 'Laboratory', icon: FlaskConical, configured: modes.laboratory },
    { key: 'exhibition', label: 'Exhibition', icon: Presentation, configured: modes.exhibition },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-1">
        {modeItems.map((mode) => {
          const Icon = mode.icon;
          return (
            <Tooltip key={mode.key}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-300",
                    mode.configured
                      ? "bg-emerald-100 text-emerald-600"
                      : "bg-muted/50 text-muted-foreground/40"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <p>{mode.configured ? `${mode.label} configured` : `${mode.label} not configured`}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
};

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
    { id: 'all', label: 'All', icon: LayoutGrid },
    { id: 'marketing', label: 'Marketing', icon: Target },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'business', label: 'Business', icon: TrendingUp },
    { id: 'ml', label: 'ML', icon: Brain },
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
      'blank': Plus,
      'customer-analytics': BarChart3,
      'price-ladder-analytics': Layers,
      'revenue-mix-optimization': DollarSign,
      'ecom-promo-planning': Megaphone,
      'ecom-media-planning': Monitor,
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
      'blank': 'bg-slate-600',
      'customer-analytics': 'bg-violet-600',
      'price-ladder-analytics': 'bg-teal-600',
      'revenue-mix-optimization': 'bg-pink-600',
      'ecom-promo-planning': 'bg-yellow-600',
      'ecom-media-planning': 'bg-lime-600',
    };
    return colorMap[slug] || 'bg-gray-600';
  };

  // Category mapping for apps
  const getAppCategory = (slug: string) => {
    const categoryMap: Record<string, string> = {
      'marketing-mix': 'marketing',
      'promo-effectiveness': 'marketing',
      'ecom-promo-planning': 'marketing',
      'ecom-media-planning': 'marketing',
      'forecasting': 'analytics',
      'exploratory-data-analysis': 'analytics',
      'customer-analytics': 'analytics',
      'price-ladder-analytics': 'analytics',
      'demand-forecasting': 'business',
      'price-optimization': 'business',
      'revenue-mix-optimization': 'business',
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
    // Exclude custom apps from the main filtered apps (they'll be shown separately)
    return matchesSearch && matchesCategory && !app.custom;
  });

  const customApps = displayApps.filter(app => app.custom);

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
          {/* Recent Projects Section */}
          {recentProjects.length > 0 && (
            <section className="border-b border-border/40 bg-muted/30 animate-fade-in" style={animationStyle(0.3)}>
              <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Clock className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Recent Projects</h2>
                      <p className="text-xs text-muted-foreground">Continue where you left off</p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-xs text-muted-foreground hover:text-primary h-8 gap-1"
                  >
                    View All
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {recentProjects.map((project) => {
                    const Icon = project.icon;
                    return (
                      <Card
                        key={project.id}
                        className={cn(
                          "group bg-card cursor-pointer overflow-hidden",
                          "border border-border/50 hover:border-primary/40",
                          "shadow-sm hover:shadow-[0_12px_28px_rgba(var(--color-primary-rgb, 59,130,246),0.12)]",
                          "transition-all duration-300 hover:-translate-y-2"
                        )}
                        onClick={() => {
                          localStorage.setItem('current-app', JSON.stringify({ id: appMap[project.appId] || 0, slug: project.appId }));
                          navigate(`/projects?app=${project.appId}`);
                        }}
                      >
                        <div className="p-4">
                          <div className="flex items-start gap-3 mb-4">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                              "bg-primary/10 text-primary",
                              "transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground",
                              "group-hover:scale-105"
                            )}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-foreground text-sm truncate group-hover:text-primary transition-colors duration-300">
                                {project.name}
                              </h4>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {project.appTitle}
                              </p>
                            </div>
                          </div>
                          
                          {/* Mode Status Tabs */}
                          <div className="mb-4">
                            <p className="text-[10px] text-muted-foreground font-medium mb-2 uppercase tracking-wider">Mode Status</p>
                            <ModeStatusIndicator modes={project.modes} />
                          </div>
                          
                          <div className="flex items-center justify-between pt-3 border-t border-border/40">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              <span className="text-[10px] font-medium">{formatRelativeTime(project.lastModified)}</span>
                            </div>
                            <div className="flex items-center gap-1 text-primary text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-all duration-300">
                              <span>Open</span>
                              <ChevronRight className="w-3 h-3" />
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          <div className="max-w-7xl mx-auto px-6 py-8 pb-20">
            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-8 animate-fade-in" style={animationStyle(0.4)}>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-3 text-muted-foreground">Loading applications...</span>
              </div>
            )}

            {/* Section Header with Search & Filters */}
            {!loading && (
              <div className="mb-8 animate-fade-in" style={animationStyle(0.4)}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center">
                    <LayoutGrid className="w-4.5 h-4.5 text-secondary" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Choose Application</h2>
                    <p className="text-xs text-muted-foreground">Select a template to start a new project</p>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Search */}
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                    <Input
                      type="text"
                      placeholder="Search applications..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 h-9 bg-muted/30 border-border/50 focus:border-primary/50 focus:bg-card text-sm"
                    />
                  </div>
                  
                  {/* Category Pills */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {categories.map((category) => {
                      const CategoryIcon = category.icon;
                      const isActive = selectedCategory === category.id;
                      return (
                        <button
                          key={category.id}
                          onClick={() => setSelectedCategory(category.id)}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap border",
                            isActive 
                              ? "bg-primary text-primary-foreground border-primary" 
                              : "bg-card text-muted-foreground border-border/50 hover:border-primary/40 hover:text-foreground"
                          )}
                        >
                          <CategoryIcon className="w-3.5 h-3.5" />
                          {category.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* All Applications */}
            {!loading && filteredApps.length > 0 && (
              <div className="animate-fade-in" style={animationStyle(1.0)}>
                <div className="flex items-center gap-2 mb-6">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-bold text-foreground">All Applications</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredApps.map((app, index) => {
                    const Icon = app.icon;
                    return (
                      <Card 
                        key={app.id}
                        className="group relative bg-card border border-border hover:border-primary/50 hover:shadow-xl transition-all duration-300 overflow-hidden hover-scale cursor-pointer animate-scale-in"
                        style={animationStyle(1.1 + index * 0.05)}
                        onClick={() => handleAppSelect(app.id)}
                      >
                        {/* Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        
                        <div className="relative p-4 h-full flex flex-col">
                          <div className="flex items-start gap-3 mb-3">
                            <div className={`${app.color} w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-110 transition-transform duration-300`}>
                              <Icon className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors mb-1">
                                {app.title}
                              </h3>
                              <p className="text-muted-foreground text-xs leading-relaxed line-clamp-2">
                                {app.description}
                              </p>
                            </div>
                          </div>
                          
                          {app.modules.length > 0 && (
                            <div className="mb-4 flex-1">
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
                            className="w-full justify-between text-sm group-hover:bg-primary/5 group-hover:text-primary transition-colors mt-auto"
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
              <div className="mt-10 mb-12 animate-fade-in" style={animationStyle(1.4)}>
                <div className="flex items-center gap-2 mb-6">
                  <Plus className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-bold text-foreground">Custom Applications</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {customApps.map((app, index) => {
                    const Icon = app.icon;
                    return (
                      <Card 
                        key={app.id}
                        className="group relative bg-card border border-dashed border-border hover:border-primary/50 hover:shadow-xl transition-all duration-300 overflow-hidden hover-scale cursor-pointer animate-scale-in"
                        style={animationStyle(1.5 + index * 0.1)}
                        onClick={() => handleAppSelect(app.id)}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        
                        <div className="relative p-4 h-full flex flex-col">
                          <div className="flex items-start gap-3 mb-3">
                            <div className={`${app.color} w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-110 transition-transform duration-300`}>
                              <Icon className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-base font-bold text-foreground mb-1 group-hover:text-primary transition-colors">
                                {app.title}
                              </h3>
                              <p className="text-muted-foreground text-xs leading-relaxed line-clamp-2">
                                {app.description}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex-1"></div>
                          
                          <Button 
                            variant="ghost"
                            size="sm"
                            className="w-full justify-between text-sm group-hover:bg-primary/5 group-hover:text-primary transition-colors mt-auto"
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


            {/* No Results */}
            {!loading && filteredApps.length === 0 && (
              <div className="text-center py-20 animate-fade-in">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-secondary/50 flex items-center justify-center">
                  <Search className="w-10 h-10 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">No applications found</h3>
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
