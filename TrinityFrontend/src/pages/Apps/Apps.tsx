import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BarChart3, Target, Zap, Plus, ArrowRight, Search, TrendingUp, Brain, Users, ShoppingCart, LineChart, PieChart, Database, Sparkles, Layers, DollarSign, Megaphone, Monitor, LayoutGrid, ChevronDown, Lock, Info } from 'lucide-react';
import Header from '@/components/Header';
import { REGISTRY_API, TENANTS_API, ACCOUNTS_API } from '@/lib/api';
import { LOGIN_ANIMATION_TOTAL_DURATION } from '@/constants/loginAnimation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { openProjectAndNavigate } from '@/utils/openProject';
import CreateNewProject from './CreateNewProject';
import Sidebar from './Sidebar';
import WorkspaceTabs from './WorkspaceTabs';

// Types / Interfaces
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
  is_allowed?: boolean;
}

interface UnavailableApp {
  usecase_id: number;
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

const Apps: React.FC = () => {
  const navigate = useNavigate();
  const [appMap, setAppMap] = useState<Record<string, number>>({});
  const [apps, setApps] = useState<UseCaseApp[]>([]);
  const [restrictedApps, setRestrictedApps] = useState<UseCaseApp[]>([]);
  const [unavailableApps, setUnavailableApps] = useState<UnavailableApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRestricted, setLoadingRestricted] = useState(false);
  const [loadingUnavailable, setLoadingUnavailable] = useState(false);
  const [playIntro, setPlayIntro] = useState(false);
  const [introBaseDelay, setIntroBaseDelay] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [recentProjectsState, setRecentProjectsState] = useState<Array<any>>([]);
  const [activeTab, setActiveTab] = useState<'workspace' | 'my-projects'>('my-projects');
  const [myProjectsState, setMyProjectsState] = useState<Array<any>>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [loadingMyProjects, setLoadingMyProjects] = useState(false);
  const [loadingRecentProjects, setLoadingRecentProjects] = useState(false);

  const [showCustomAppsExpanded, setShowCustomAppsExpanded] = useState(false);
  const [showQMAppsExpanded, setShowQMAppsExpanded] = useState(false);

  const { isAuthenticated, user } = useAuth();

  // Fetch user name and tenant information
  useEffect(() => {
    if (isAuthenticated && user) {
      const fetchUserName = async () => {
        try {
          const userWithName = user as any;
          if (userWithName.name || userWithName.first_name || userWithName.full_name || userWithName.display_name) {
            const name = userWithName.name ||
              (userWithName.first_name && userWithName.last_name
                ? `${userWithName.first_name} ${userWithName.last_name}`
                : userWithName.first_name) ||
              userWithName.full_name ||
              userWithName.display_name;
            setUserName(name);
            return;
          }

          const res = await fetch(`${ACCOUNTS_API}/users/me/`, { credentials: 'include' });
          if (res.ok) {
            const userData = await res.json();
            const name = userData.name ||
              (userData.first_name && userData.last_name
                ? `${userData.first_name} ${userData.last_name}`
                : userData.first_name) ||
              userData.full_name ||
              userData.display_name;
            if (name) setUserName(name);
            else setUserName(user.username);
          } else {
            setUserName(user.username);
          }
        } catch (err) {
          setUserName(user.username);
        }
      };

      const fetchTenantInfo = async () => {
        try {
          const res = await fetch(`${TENANTS_API}/tenants/current/`, { credentials: 'include' });
          if (res.ok) {
            const tenantData = await res.json();
            if (tenantData && tenantData.name) setTenantName(tenantData.name);
            else setTenantName(null);
          } else if (res.status === 404) {
            setTenantName(null);
          }
        } catch (err) {
          // ignore
        }
      };

      fetchUserName();
      fetchTenantInfo();
    }
  }, [isAuthenticated, user]);

  // Load apps (allowed, restricted, unavailable)
  useEffect(() => {
    const loadApps = async () => {
      if (!isAuthenticated || !user) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const registryRes = await fetch(`${REGISTRY_API}/apps/`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (registryRes.ok) {
          const registryData = await registryRes.json();
          if (Array.isArray(registryData)) {
            setApps(registryData);
            const map: Record<string, number> = {};
            registryData.forEach((a: any) => (map[a.slug] = a.id));
            setAppMap(map);
          }
        }
      } catch (err) {
        // ignore
      } finally {
        setLoading(false);
      }

      setLoadingRestricted(true);
      try {
        const restrictedRes = await fetch(`${REGISTRY_API}/apps/?include_restricted=true`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (restrictedRes.ok) {
          const allAppsData = await restrictedRes.json();
          if (Array.isArray(allAppsData)) {
            const restricted = allAppsData.filter((app: UseCaseApp) => app && app.is_allowed === false);
            setRestrictedApps(restricted.length > 0 ? restricted : []);
          } else setRestrictedApps([]);
        } else setRestrictedApps([]);
      } catch (err) {
        setRestrictedApps([]);
      } finally {
        setLoadingRestricted(false);
      }

      setLoadingUnavailable(true);
      try {
        const unavailableRes = await fetch(`${REGISTRY_API}/apps/unavailable/`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (unavailableRes.ok) {
          const unavailableData = await unavailableRes.json();
          if (Array.isArray(unavailableData)) {
            const validUnavailable = unavailableData.filter((app: UnavailableApp) => app && app.usecase_id && app.slug);
            setUnavailableApps(validUnavailable.length > 0 ? validUnavailable : []);
          } else setUnavailableApps([]);
        } else setUnavailableApps([]);
      } catch (err) {
        setUnavailableApps([]);
      } finally {
        setLoadingUnavailable(false);
      }
    };

    loadApps();
  }, [isAuthenticated, user]);

  // Recent projects
  useEffect(() => {
    setRecentProjectsState([]);
    const loadAllProjects = async () => {
      if (!isAuthenticated || !user || !REGISTRY_API) return;
      setLoadingRecentProjects(true);
      const limit = 20;
      const offset = 0;
      const apiUrl = `${REGISTRY_API}/projects/?ordering=-updated_at&limit=${limit}&offset=${offset}`;
      try {
        const projectsRes = await fetch(apiUrl, { method: 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        if (projectsRes.ok) {
          const projectsData = await projectsRes.json();
          if (Array.isArray(projectsData)) {
            const transformedProjects = projectsData
              .map((project: any) => {
                if (!project.app_slug || !project.app_name) return null;
                return {
                  id: project.id?.toString() || '',
                  name: project.name,
                  appId: project.app_slug,
                  appTitle: project.app_name,
                  lastModified: new Date(project.last_modified || project.updated_at),
                  relativeTime: project.relative_time,
                  icon: getAppIcon(project.app_slug),
                  modes: project.modes || { workflow: false, laboratory: false, exhibition: false },
                  is_allowed: project.is_allowed !== undefined ? project.is_allowed : true,
                };
              })
              .filter((p: any) => p !== null);

            setRecentProjectsState(transformedProjects as any);
          }
        }
      } catch (err) {
        // ignore
      } finally {
        setLoadingRecentProjects(false);
      }
    };

    loadAllProjects();
    return () => setRecentProjectsState([]);
  }, [isAuthenticated, user]);

  // My projects
  useEffect(() => {
    setMyProjectsState([]);
    const loadMyProjects = async () => {
      if (!isAuthenticated || !user || !REGISTRY_API) return;
      setLoadingMyProjects(true);
      const limit = 20;
      const offset = 0;
      const apiUrl = `${REGISTRY_API}/projects/?scope=user&ordering=-updated_at&limit=${limit}&offset=${offset}`;
      try {
        const projectsRes = await fetch(apiUrl, { method: 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        if (projectsRes.ok) {
          const projectsData = await projectsRes.json();
          if (Array.isArray(projectsData)) {
            const transformedProjects = projectsData
              .map((project: any) => {
                if (!project.app_slug || !project.app_name) return null;
                return {
                  id: project.id?.toString() || '',
                  name: project.name,
                  appId: project.app_slug,
                  appTitle: project.app_name,
                  lastModified: new Date(project.last_modified || project.updated_at),
                  relativeTime: project.relative_time,
                  icon: getAppIcon(project.app_slug),
                  modes: project.modes || { workflow: false, laboratory: false, exhibition: false },
                  is_allowed: project.is_allowed !== undefined ? project.is_allowed : true,
                };
              })
              .filter((p: any) => p !== null);

            setMyProjectsState(transformedProjects as any);
          }
        }
      } catch (err) {
        // ignore
      } finally {
        setLoadingMyProjects(false);
      }
    };

    loadMyProjects();
    return () => setMyProjectsState([]);
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = sessionStorage.getItem('trinity-login-anim');
    if (!stored) return;
    sessionStorage.removeItem('trinity-login-anim');
    try {
      const meta = JSON.parse(stored) as { startedAt?: number; totalDuration?: number };
      if (meta && typeof meta.startedAt === 'number') {
        const total = typeof meta.totalDuration === 'number' ? meta.totalDuration : LOGIN_ANIMATION_TOTAL_DURATION;
        const elapsed = Date.now() - meta.startedAt;
        const remaining = Math.max(0, total - elapsed) / 1000;
        setIntroBaseDelay(remaining);
        setPlayIntro(true);
        return;
      }
    } catch (err) {
      // ignore
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
          data.forEach((a) => { map[a.slug] = a.id; });
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
      const res = await fetch(`${REGISTRY_API}/apps/${backendId}/`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.environment) {
          const env = { ...data.environment, APP_NAME: appId, APP_ID: backendId.toString() };
          localStorage.setItem('env', JSON.stringify(env));
        } else {
          localStorage.setItem('env', JSON.stringify({ APP_NAME: appId, APP_ID: backendId.toString() }));
        }
      }
    } catch (err) {
      // ignore
    }
    navigate(`/projects?app=${appId}`);
  };

  const openRecentProject = async (project: any) => {
    const appId = appMap[project.appId];
    if (!appId) {
      console.error('App ID not found for slug:', project.appId);
      return;
    }

    await openProjectAndNavigate({ id: project.id, name: project.name, appId: project.appId }, appId, navigate, {
      onError: (error) => console.error('Failed to open project:', error),
    });
  };

  const categories = [
    { id: 'all', label: 'All', icon: LayoutGrid },
    { id: 'marketing', label: 'Marketing', icon: Target },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'business', label: 'Business', icon: TrendingUp },
    { id: 'ml', label: 'ML', icon: Brain },
  ];

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

  const getAppColorValue = (slug: string) => {
    const colorValueMap: Record<string, string> = {
      'marketing-mix': '#2563eb',
      'forecasting': '#16a34a',
      'promo-effectiveness': '#ea580c',
      'exploratory-data-analysis': '#9333ea',
      'customer-segmentation': '#4f46e5',
      'demand-forecasting': '#059669',
      'price-optimization': '#e11d48',
      'churn-prediction': '#d97706',
      'blank': '#475569',
      'customer-analytics': '#7c3aed',
      'price-ladder-analytics': '#0d9488',
      'revenue-mix-optimization': '#db2777',
      'ecom-promo-planning': '#ca8a04',
      'ecom-media-planning': '#65a30d',
    };
    return colorValueMap[slug] || '#4b5563';
  };

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
    atoms_in_molecules: app.atoms_in_molecules || [],
  }));

  const filteredApps = displayApps.filter(app => {
    const matchesSearch = app.title.toLowerCase().includes(searchTerm.toLowerCase()) || app.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || app.category === selectedCategory;
    return matchesSearch && matchesCategory && !app.custom;
  });

  const customApps = displayApps.filter(app => app.custom);

  const allRestrictedApps = (Array.isArray(restrictedApps) ? restrictedApps : [])
    .filter(app => app && app.slug)
    .map(app => ({
      id: app.slug || `restricted-${app.id || 'unknown'}`,
      title: app.name || 'Unknown App',
      description: app.description || '',
      icon: getAppIcon(app.slug || ''),
      color: getAppColor(app.slug || ''),
      category: getAppCategory(app.slug || ''),
      featured: false,
      custom: app.slug === 'blank',
      modules: app.modules || [],
      molecules: app.molecules || [],
      atoms_in_molecules: app.atoms_in_molecules || [],
    }))
    .filter(app => app.id);

  const customRestrictedApps = allRestrictedApps.filter(app => app.custom);
  const displayRestrictedApps = allRestrictedApps.filter(app => !app.custom);

  const filteredRestrictedApps = displayRestrictedApps.filter(app => {
    if (!app.title || !app.description) return false;
    const matchesSearch = app.title.toLowerCase().includes(searchTerm.toLowerCase()) || app.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || app.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredCustomRestrictedApps = customRestrictedApps.filter(app => {
    if (!app.title || !app.description) return false;
    const matchesSearch = app.title.toLowerCase().includes(searchTerm.toLowerCase()) || app.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || app.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const allUnavailableApps = (Array.isArray(unavailableApps) ? unavailableApps : [])
    .filter(app => app && app.slug && app.usecase_id)
    .map(app => ({
      id: `usecase-${app.usecase_id}`,
      usecase_id: app.usecase_id,
      title: app.name || 'Unknown App',
      description: app.description || '',
      icon: getAppIcon(app.slug || ''),
      color: getAppColor(app.slug || ''),
      category: getAppCategory(app.slug || ''),
      featured: false,
      custom: app.slug === 'blank',
      modules: app.modules || [],
      molecules: app.molecules || [],
      atoms_in_molecules: app.atoms_in_molecules || [],
    }))
    .filter(app => app.id && app.usecase_id);

  const customUnavailableApps = allUnavailableApps.filter(app => app.custom);
  const displayUnavailableApps = allUnavailableApps.filter(app => !app.custom);

  const filteredUnavailableApps = displayUnavailableApps.filter(app => {
    if (!app.title || !app.description) return false;
    const matchesSearch = app.title.toLowerCase().includes(searchTerm.toLowerCase()) || app.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || app.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredCustomUnavailableApps = customUnavailableApps.filter(app => {
    if (!app.title || !app.description) return false;
    const matchesSearch = app.title.toLowerCase().includes(searchTerm.toLowerCase()) || app.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || app.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredRecentProjects = recentProjectsState.filter((project: any) => {
    const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) || project.appTitle.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || getAppCategory(project.appId) === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredMyProjects = myProjectsState.filter((project: any) => {
    const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) || project.appTitle.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || getAppCategory(project.appId) === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const animationStyle = (offset: number) => ({
    animationDelay: `${(introBaseDelay + offset).toFixed(1)}s`,
    animationFillMode: 'both' as const,
    ...(playIntro ? { opacity: 0 } : {}),
  });

  const sidebarWidth = sidebarOpen ? 260 : 48;

  return (
    <div className="relative bg-background">
      <div className="fixed top-0 left-0 right-0 z-50 animate-slide-in-from-top" style={animationStyle(0.2)}>
        <Header sidebarOpen={sidebarOpen} onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} />
      </div>

      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        userName={userName}
        user={user}
        tenantName={tenantName}
        myProjectsCount={myProjectsState.length}
        recentProjectsCount={recentProjectsState.length}
        appsCount={apps.length}
      />

      <div className="relative z-10" style={{ marginTop: '80px', marginLeft: `${sidebarWidth}px` }}>
        <div className="max-w-7xl mx-auto px-6 pt-8 pb-6">
          <div className="animate-fade-in" style={animationStyle(0.4)}>
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <Input type="text" placeholder="Search projects and applications..." value={searchTerm} onChange={(e: any) => setSearchTerm(e.target.value)} className="pl-9 h-9 bg-muted/30 border-border/50 focus:border-primary/50 focus:bg-card text-sm" />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {categories.map((category) => {
                  const CategoryIcon = category.icon;
                  const isActive = selectedCategory === category.id;
                  return (
                    <button key={category.id} onClick={() => setSelectedCategory(category.id)} className={cn(
                      "inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap border",
                      isActive ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border/50 hover:border-primary/40 hover:text-foreground"
                    )}>
                      <CategoryIcon className="w-3.5 h-3.5" />
                      {category.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <WorkspaceTabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          filteredMyProjects={filteredMyProjects}
          filteredRecentProjects={filteredRecentProjects}
          loadingMyProjects={loadingMyProjects}
          loadingRecentProjects={loadingRecentProjects}
          searchTerm={searchTerm}
          selectedCategory={selectedCategory}
          tenantName={tenantName}
          onOpenProject={openRecentProject}
          onCreateProject={() => setCreateProjectOpen(true)}
          getAppColorValue={getAppColorValue}
          formatRelativeTime={formatRelativeTime}
          animationStyle={animationStyle}
        />

        <div className="max-w-7xl mx-auto px-6 py-4 pb-20">
          {loading && (
            <div className="flex items-center justify-center py-8 animate-fade-in" style={animationStyle(0.4)}>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-3 text-muted-foreground">Loading applications...</span>
            </div>
          )}

          <div className="bg-white -mx-6 px-6 py-6 pb-20">
            {!loading && (customApps.length > 0 || filteredCustomRestrictedApps.length > 0 || filteredCustomUnavailableApps.length > 0) && (
              <div id="custom-applications-section" className="animate-fade-in scroll-mt-8" style={animationStyle(1.0)}>
                <div className="flex items-center justify-between gap-2 mb-6">
                  <div className="flex items-center gap-2">
                    <Plus className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-bold text-foreground">{tenantName || 'Custom'} Applications</h3>
                  </div>

                  {((customApps.length + filteredCustomRestrictedApps.length + filteredCustomUnavailableApps.length) > 3) && (
                    <Button variant="ghost" size="sm" onClick={() => setShowCustomAppsExpanded(!showCustomAppsExpanded)} className="text-xs text-muted-foreground hover:text-primary hover:bg-primary/5">
                      {showCustomAppsExpanded ? 'Show Less' : 'Show More'}
                      <ChevronDown className={cn('w-3 h-3 ml-1 transition-transform duration-200', showCustomAppsExpanded ? 'rotate-180' : 'rotate-0')} />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {(() => {
                    const allCustomApps = [
                      ...customApps.map(app => ({ ...app, type: 'regular' as const })),
                      ...filteredCustomRestrictedApps.map(app => ({ ...app, type: 'restricted' as const })),
                      ...filteredCustomUnavailableApps.map(app => ({ ...app, type: 'unavailable' as const })),
                      { id: 'placeholder-1', title: 'Data Analytics Pro', color: 'bg-indigo-600', icon: Database, type: 'placeholder' as const, description: 'Coming soon' },
                      { id: 'placeholder-2', title: 'Business Intelligence', color: 'bg-purple-600', icon: BarChart3, type: 'placeholder' as const, description: 'Coming soon' },
                    ];

                    const appsToShow = showCustomAppsExpanded ? allCustomApps : allCustomApps.slice(0, 3);

                    return appsToShow.map((app, index) => {
                      const Icon = app.icon;

                      return (
                        <Card key={app.id} className={cn(
                          "group relative bg-card border animate-scale-in",
                          app.type === 'regular' ? "border-dashed border-border hover:border-primary/50 shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden hover:-translate-y-1 cursor-pointer" : "border-dashed border-border/50 opacity-60 cursor-not-allowed"
                        )} style={animationStyle(1.1 + index * 0.05)} onClick={app.type === 'regular' ? () => handleAppSelect(app.id) : undefined}>
                          {app.type === 'regular' && <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />}

                          <div className="relative p-4">
                            <div className="absolute top-4 right-4 z-10">
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button onClick={(e) => { if (app.type === 'regular') e.stopPropagation(); }} className="w-6 h-6 rounded-full bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors">
                                      <Info className="w-3.5 h-3.5 text-muted-foreground" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" sideOffset={8} className="max-w-xs text-xs z-[9999]">
                                    <p>{app.description}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>

                            <div className="flex items-start gap-3">
                              <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md transition-transform duration-300",
                                app.type === 'regular' ? `${app.color} group-hover:scale-110` : app.type === 'placeholder' ? `${app.color} group-hover:scale-110` : 'bg-gray-500'
                              )}>
                                <Icon className="w-5 h-5 text-white" />
                              </div>

                              <div className="flex-1 min-w-0 pr-8 flex flex-col gap-2">
                                <h3 className={cn(
                                  "text-sm font-semibold leading-tight",
                                  app.type === 'regular' || app.type === 'placeholder' ? "text-foreground group-hover:text-primary transition-colors" : "text-muted-foreground"
                                )}>
                                  {app.title}
                                </h3>

                                <Button variant="ghost" size="sm" className={cn(
                                  "w-fit font-normal h-7 px-2 text-xs -ml-2",
                                  app.type === 'regular' ? "group-hover:bg-primary/5 group-hover:text-primary transition-colors" : app.type === 'placeholder' ? "group-hover:bg-primary/5 group-hover:text-primary transition-colors" : "text-muted-foreground"
                                )} disabled={app.type !== 'regular'} onClick={app.type === 'regular' ? (e: any) => { e.stopPropagation(); handleAppSelect(app.id); } : undefined}>
                                  {app.type === 'regular' ? 'Get Started' : app.type === 'restricted' ? 'Restricted' : app.type === 'unavailable' ? 'Not Available' : 'Coming Soon'}
                                  {app.type === 'regular' || app.type === 'placeholder' ? <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform" /> : <Lock className="w-3 h-3 ml-1" />}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {(!loading && filteredApps.length > 0) || (!loadingRestricted && filteredRestrictedApps.length > 0) || (!loadingUnavailable && filteredUnavailableApps.length > 0) ? (
              <div id="all-applications-section" className="mt-10 mb-12 animate-fade-in scroll-mt-8" style={animationStyle(1.4)}>
                <div className="flex items-center justify-between gap-2 mb-6">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-bold text-foreground">QM Applications</h3>
                  </div>

                  {((filteredApps.length + filteredRestrictedApps.length + filteredUnavailableApps.length) > 3) && (
                    <Button variant="ghost" size="sm" onClick={() => setShowQMAppsExpanded(!showQMAppsExpanded)} className="text-xs text-muted-foreground hover:text-primary hover:bg-primary/5">
                      {showQMAppsExpanded ? 'Show Less' : 'Show More'}
                      <ChevronDown className={cn('w-3 h-3 ml-1 transition-transform duration-200', showQMAppsExpanded ? 'rotate-180' : 'rotate-0')} />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {(() => {
                    const allApps = [
                      ...filteredApps.map(app => ({ ...app, type: 'regular' as const })),
                      ...filteredRestrictedApps.map(app => ({ ...app, type: 'restricted' as const })),
                      ...filteredUnavailableApps.map(app => ({ ...app, type: 'unavailable' as const })),
                    ];

                    const appsToShow = showQMAppsExpanded ? allApps : allApps.slice(0, 3);

                    return appsToShow.map((app, index) => {
                      const Icon = app.icon;

                      return (
                        <Card key={app.id} className={cn(
                          "group relative bg-card border animate-scale-in",
                          app.type === 'regular' ? "border-border hover:border-primary/50 shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden hover:-translate-y-1 cursor-pointer" : "border-border/50 opacity-40 cursor-not-allowed"
                        )} style={animationStyle(1.5 + index * 0.05)} onClick={app.type === 'regular' ? () => handleAppSelect(app.id) : undefined}>
                          {app.type === 'regular' && <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />}

                          <div className="relative p-4">
                            <div className="absolute top-4 right-4 z-10">
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button onClick={(e) => { if (app.type === 'regular') e.stopPropagation(); }} className="w-6 h-6 rounded-full bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors">
                                      <Info className="w-3.5 h-3.5 text-muted-foreground" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" sideOffset={8} className="max-w-xs text-xs z-[9999]">
                                    <p>{app.description}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>

                            <div className="flex items-start gap-3">
                              <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md transition-transform duration-300",
                                app.type === 'regular' ? `${app.color} group-hover:scale-110` : 'bg-gray-500'
                              )}>
                                <Icon className="w-5 h-5 text-white" />
                              </div>

                              <div className="flex-1 min-w-0 pr-8 flex flex-col gap-2">
                                <h3 className={cn(
                                  "text-sm font-semibold leading-tight",
                                  app.type === 'regular' ? "text-foreground group-hover:text-primary transition-colors" : "text-muted-foreground"
                                )}>
                                  {app.title}
                                </h3>

                                <Button variant="ghost" size="sm" className={cn(
                                  "w-fit h-7 px-2 text-xs -ml-2",
                                  app.type === 'regular' ? "group-hover:bg-primary/5 group-hover:text-primary transition-colors" : "text-muted-foreground"
                                )} disabled={app.type !== 'regular'}>
                                  {app.type === 'regular' ? 'Get Started' : app.type === 'restricted' ? 'Restricted' : 'Not Available'}
                                  {app.type === 'regular' ? <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform" /> : <Lock className="w-3 h-3 ml-1" />}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    });
                  })()}
                </div>
              </div>
            ) : null}

            {!loading && !loadingRestricted && !loadingUnavailable && filteredApps.length === 0 && filteredRestrictedApps.length === 0 && filteredUnavailableApps.length === 0 && (
              <div className="text-center py-20 animate-fade-in">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-secondary/50 flex items-center justify-center">
                  <Search className="w-10 h-10 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">No applications found</h3>
                <p className="text-muted-foreground">Try adjusting your search or filter criteria</p>
              </div>
            )}

            <div className="mt-16 text-center text-sm text-muted-foreground animate-fade-in" style={animationStyle(2.0)}>
              "The Matrix has you" – pick your path
            </div>
          </div>
        </div>
      </div>

      <CreateNewProject open={createProjectOpen} onOpenChange={setCreateProjectOpen} apps={displayApps} appMap={appMap} tenantName={tenantName} />
    </div>
  );
};

export default Apps;
