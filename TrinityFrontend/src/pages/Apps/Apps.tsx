import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Target, Zap, Plus, ArrowRight, Search, TrendingUp, Brain, Users, ShoppingCart, LineChart, PieChart, Database, Sparkles, Layers, DollarSign, Megaphone, Monitor, LayoutGrid, Clock, ChevronDown, GitBranch, FlaskConical, Presentation, Info, PanelLeft, Lock, PackageX } from 'lucide-react';
import Header from '@/components/Header';
import { REGISTRY_API, TENANTS_API, ACCOUNTS_API } from '@/lib/api';
import { LOGIN_ANIMATION_TOTAL_DURATION } from '@/constants/loginAnimation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { openProjectAndNavigate } from '@/utils/openProject';
import CreateNewProject from './CreateNewProject';
import Sidebar from './Sidebar';
import WorkspaceTabs from './WorkspaceTabs';

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
  is_allowed?: boolean; // Optional flag indicating if app is allowed for current user
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

const Apps = () => {
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
  const [recentProjectsState, setRecentProjectsState] = useState<Array<{
    id: string;
    name: string;
    appId: string;
    appTitle: string;
    lastModified: Date;
    relativeTime?: string;
    icon: any;
    modes: ModeStatus;
  }>>([]);
  const [activeTab, setActiveTab] = useState<'workspace' | 'my-projects'>('my-projects');
  const [myProjectsState, setMyProjectsState] = useState<Array<{
    id: string;
    name: string;
    appId: string;
    appTitle: string;
    lastModified: Date;
    relativeTime?: string;
    icon: any;
    modes: ModeStatus;
  }>>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [loadingMyProjects, setLoadingMyProjects] = useState(false);
  const [loadingRecentProjects, setLoadingRecentProjects] = useState(false);

  const { isAuthenticated, user } = useAuth();

  // Fetch user name and tenant information
  useEffect(() => {
    if (isAuthenticated && user) {
      console.log('👤 User logged in - Username:', user.username);
      
      // Fetch user details to get name
      const fetchUserName = async () => {
        try {
          // First check if user object already has name (might not be in TypeScript interface)
          const userWithName = user as any;
          if (userWithName.name || userWithName.first_name || userWithName.full_name || userWithName.display_name) {
            const name = userWithName.name || 
                       (userWithName.first_name && userWithName.last_name 
                         ? `${userWithName.first_name} ${userWithName.last_name}` 
                         : userWithName.first_name) ||
                       userWithName.full_name || 
                       userWithName.display_name;
            setUserName(name);
            console.log('👤 User Name (from user object):', name);
            return;
          }

          // If not in user object, fetch from API
          const res = await fetch(`${ACCOUNTS_API}/users/me/`, {
            credentials: 'include',
          });
          if (res.ok) {
            const userData = await res.json();
            // Check for name, first_name, last_name, or full_name fields
            const name = userData.name || 
                       (userData.first_name && userData.last_name 
                         ? `${userData.first_name} ${userData.last_name}` 
                         : userData.first_name) ||
                       userData.full_name || 
                       userData.display_name;
            if (name) {
              setUserName(name);
              console.log('👤 User Name (from API):', name);
            } else {
              // Fallback to username if no name found
              setUserName(user.username);
            }
          } else {
            // Fallback to username if API call fails
            setUserName(user.username);
          }
        } catch (err) {
          console.log('⚠️ Error fetching user name:', err);
          // Fallback to username on error
          setUserName(user.username);
        }
      };
      
      // Fetch tenant information for current user
      const fetchTenantInfo = async () => {
        try {
          // Use the new endpoint to get the current user's tenant
          const res = await fetch(`${TENANTS_API}/tenants/current/`, {
            credentials: 'include',
          });
          if (res.ok) {
            const tenantData = await res.json();
            if (tenantData && tenantData.name) {
              setTenantName(tenantData.name);
              console.log('🏢 Tenant Name:', tenantData.name);
            } else {
              console.log('⚠️ No tenant data found in response');
            }
          } else if (res.status === 404) {
            console.log('⚠️ No tenant found for current user');
            setTenantName(null);
          } else {
            console.log('⚠️ Failed to fetch tenant information:', res.status);
          }
        } catch (err) {
          console.log('⚠️ Error fetching tenant information:', err);
        }
      };
      
      fetchUserName();
      fetchTenantInfo();
    }
  }, [isAuthenticated, user]);

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

      // Fetch restricted apps
      console.log('🔍 Fetching restricted apps from registry API...');
      setLoadingRestricted(true);
      try {
        const restrictedRes = await fetch(`${REGISTRY_API}/apps/?include_restricted=true`, { 
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          }
        });
    
        if (restrictedRes.ok) {
          const allAppsData = await restrictedRes.json();
          console.log('✅ Loaded all apps (allowed + restricted):', allAppsData);
          
          if (Array.isArray(allAppsData)) {
            // Filter to only get restricted apps (is_allowed === false)
            const restricted = allAppsData.filter((app: UseCaseApp) => app && app.is_allowed === false);
            console.log('📱 Number of restricted apps:', restricted.length);
            setRestrictedApps(restricted.length > 0 ? restricted : []);
          } else {
            console.log('❌ Restricted apps response is not an array:', typeof allAppsData, allAppsData);
            setRestrictedApps([]);
          }
        } else {
          const text = await restrictedRes.text();
          console.log('❌ Failed to load restricted apps:', restrictedRes.status, text);
          setRestrictedApps([]);
        }
      } catch (err) {
        console.error('💥 Restricted apps fetch error:', err);
        setRestrictedApps([]);
      } finally {
        setLoadingRestricted(false);
      }

      // Fetch unavailable apps
      console.log('🔍 Fetching unavailable apps from registry API...');
      setLoadingUnavailable(true);
      try {
        const unavailableRes = await fetch(`${REGISTRY_API}/apps/unavailable/`, { 
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          }
        });
    
        if (unavailableRes.ok) {
          const unavailableData = await unavailableRes.json();
          console.log('✅ Loaded unavailable apps:', unavailableData);
          
          if (Array.isArray(unavailableData)) {
            console.log('📱 Number of unavailable apps:', unavailableData.length);
            // Filter out any invalid entries
            const validUnavailable = unavailableData.filter((app: UnavailableApp) => app && app.usecase_id && app.slug);
            setUnavailableApps(validUnavailable.length > 0 ? validUnavailable : []);
          } else {
            console.log('❌ Unavailable apps response is not an array:', typeof unavailableData, unavailableData);
            setUnavailableApps([]);
          }
        } else {
          const text = await unavailableRes.text();
          console.log('❌ Failed to load unavailable apps:', unavailableRes.status, text);
          setUnavailableApps([]);
        }
      } catch (err) {
        console.error('💥 Unavailable apps fetch error:', err);
        setUnavailableApps([]);
      } finally {
        setLoadingUnavailable(false);
      }
    };

    loadApps();
  }, [isAuthenticated, user]);

  // Fetch and transform all projects for recent projects section
  useEffect(() => {
    // Clear state on mount to ensure fresh data on reload
    setRecentProjectsState([]);

    const loadAllProjects = async () => {
      // Check if user is authenticated
      if (!isAuthenticated || !user) {
        return;
      }

      // Check if REGISTRY_API is defined
      if (!REGISTRY_API) {
        console.error('❌ REGISTRY_API is not defined');
        return;
      }

      setLoadingRecentProjects(true);
      console.log('🔍 Fetching recent projects from registry API...');
      // Fetch recent projects with pagination: limit=10, offset=10
      const limit = 20;
      const offset = 0;
      const apiUrl = `${REGISTRY_API}/projects/?ordering=-updated_at&limit=${limit}&offset=${offset}`;
      console.log('🔗 API URL:', apiUrl);
      console.log('👤 User:', user.username);
      console.log('📄 Pagination - Limit:', limit, 'Offset:', offset);
      
      try {
        // Fetch recent projects (sorted by updated_at desc, paginated: limit=10, offset=10)
        const projectsRes = await fetch(apiUrl, { 
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          }
        });
    
        if (projectsRes.ok) {
          const projectsData = await projectsRes.json();
          console.log('✅ Loaded recent projects:', projectsData);
          console.log('📁 Number of projects:', Array.isArray(projectsData) ? projectsData.length : 'N/A');
          
          if (Array.isArray(projectsData)) {
            // Backend now provides app_slug, app_name, modes, last_modified, and is_allowed
            // Directly map backend response to frontend format
            const transformedProjects = projectsData
              .map((project: any) => {
                // Backend provides app_slug and app_name directly
                if (!project.app_slug || !project.app_name) {
                  console.warn(`⚠️ Missing app info for project ${project.id}`);
                  return null;
                }

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
              .filter((p: any) => p !== null); // Remove projects with missing app info

            console.log('📋 Loaded recent projects:', transformedProjects);
            setRecentProjectsState(transformedProjects);
          } else {
            console.log('❌ Response is not an array:', typeof projectsData);
          }
        } else {
          const text = await projectsRes.text();
          console.log('❌ Failed to load projects:', text);
          console.log('❌ Status:', projectsRes.status, projectsRes.statusText);
          
          // If 403, the session might be expired
          if (projectsRes.status === 403) {
            console.log('🔄 Session expired, redirecting to login...');
          }
        }
      } catch (err: any) {
        console.error('💥 Projects fetch error:', err);
        if (err instanceof TypeError && err.message === 'Failed to fetch') {
          console.error('❌ Network error - possible causes:');
          console.error('   - CORS issue');
          console.error('   - Network connectivity problem');
          console.error('   - API server not reachable');
          console.error('   - REGISTRY_API:', REGISTRY_API);
          console.error('   - Full API URL:', `${REGISTRY_API}/projects/`);
        } else {
          console.error('❌ Error details:', err);
          console.error('❌ Error name:', err?.name);
          console.error('❌ Error message:', err?.message);
        }
        // Don't set empty state on error, keep previous data or fallback
      } finally {
        setLoadingRecentProjects(false);
      }
    };

    loadAllProjects();

    // Cleanup function to reset state on unmount
    return () => {
      setRecentProjectsState([]);
    };
  }, [isAuthenticated, user]);

  // Fetch and transform user-specific projects for "Your Workspace" tab
  useEffect(() => {
    // Clear state on mount to ensure fresh data on reload
    setMyProjectsState([]);

    const loadMyProjects = async () => {
      // Check if user is authenticated
      if (!isAuthenticated || !user) {
        return;
      }

      // Check if REGISTRY_API is defined
      if (!REGISTRY_API) {
        console.error('❌ REGISTRY_API is not defined');
        return;
      }

      setLoadingMyProjects(true);
      console.log('🔍 Fetching user-specific projects from registry API...');
      // Fetch user-specific projects with pagination: limit=10, offset=0
      const limit = 20;
      const offset = 0;
      const apiUrl = `${REGISTRY_API}/projects/?scope=user&ordering=-updated_at&limit=${limit}&offset=${offset}`;
      console.log('🔗 API URL:', apiUrl);
      console.log('👤 User:', user.username);
      console.log('📄 Pagination - Limit:', limit, 'Offset:', offset);
      
      try {
        // Fetch user-specific projects (sorted by updated_at desc, paginated: limit=10, offset=0)
        const projectsRes = await fetch(apiUrl, { 
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          }
        });
    
        if (projectsRes.ok) {
          const projectsData = await projectsRes.json();
          console.log('✅ Loaded user-specific projects:', projectsData);
          console.log('📁 Number of projects:', Array.isArray(projectsData) ? projectsData.length : 'N/A');
          
          if (Array.isArray(projectsData)) {
            // Backend now provides app_slug, app_name, modes, and last_modified
            // Directly map backend response to frontend format
            const transformedProjects = projectsData
              .map((project: any) => {
                // Backend provides app_slug and app_name directly
                if (!project.app_slug || !project.app_name) {
                  console.warn(`⚠️ Missing app info for project ${project.id}`);
                  return null;
                }

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
              .filter((p: any) => p !== null); // Remove projects with missing app info

            console.log('📋 Loaded user-specific projects:', transformedProjects);
            setMyProjectsState(transformedProjects);
          } else {
            console.log('❌ Response is not an array:', typeof projectsData);
          }
        } else {
          const text = await projectsRes.text();
          console.log('❌ Failed to load user-specific projects:', text);
          console.log('❌ Status:', projectsRes.status, projectsRes.statusText);
          
          // If 403, the session might be expired
          if (projectsRes.status === 403) {
            console.log('🔄 Session expired, redirecting to login...');
          }
        }
      } catch (err: any) {
        console.error('💥 User projects fetch error:', err);
        if (err instanceof TypeError && err.message === 'Failed to fetch') {
          console.error('❌ Network error - possible causes:');
          console.error('   - CORS issue');
          console.error('   - Network connectivity problem');
          console.error('   - API server not reachable');
          console.error('   - REGISTRY_API:', REGISTRY_API);
          console.error('   - Full API URL:', `${REGISTRY_API}/projects/?scope=user`);
        } else {
          console.error('❌ Error details:', err);
          console.error('❌ Error name:', err?.name);
          console.error('❌ Error message:', err?.message);
        }
        // Don't set empty state on error, keep previous data or fallback
      } finally {
        setLoadingMyProjects(false);
      }
    };

    loadMyProjects();

    // Cleanup function to reset state on unmount
    return () => {
      setMyProjectsState([]);
    };
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

  const openRecentProject = async (project: {
    id: string;
    name: string;
    appId: string;
    appTitle: string;
    lastModified: Date;
    icon: any;
    modes: ModeStatus;
  }) => {
    // Get app ID from appMap
    const appId = appMap[project.appId];
    if (!appId) {
      console.error('❌ App ID not found for slug:', project.appId);
      return;
    }

    // Use shared utility function to open project and navigate
    await openProjectAndNavigate(
      {
        id: project.id,
        name: project.name,
        appId: project.appId,
      },
      appId,
      navigate,
      {
        onError: (error) => {
          console.error('Failed to open project:', error);
        },
      }
    );
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

  // Get text color for app (white text for all colored backgrounds)
  const getAppTextColor = (slug: string) => {
    return 'text-white';
  };

  // Get the actual color value for hover state (convert bg-*-600 to hex/rgb)
  const getAppColorValue = (slug: string) => {
    const colorValueMap: Record<string, string> = {
      'marketing-mix': '#2563eb', // blue-600
      'forecasting': '#16a34a', // green-600
      'promo-effectiveness': '#ea580c', // orange-600
      'exploratory-data-analysis': '#9333ea', // purple-600
      'customer-segmentation': '#4f46e5', // indigo-600
      'demand-forecasting': '#059669', // emerald-600
      'price-optimization': '#e11d48', // rose-600
      'churn-prediction': '#d97706', // amber-600
      'blank': '#475569', // slate-600
      'customer-analytics': '#7c3aed', // violet-600
      'price-ladder-analytics': '#0d9488', // teal-600
      'revenue-mix-optimization': '#db2777', // pink-600
      'ecom-promo-planning': '#ca8a04', // yellow-600
      'ecom-media-planning': '#65a30d', // lime-600
    };
    return colorValueMap[slug] || '#4b5563'; // gray-600
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

  // Transform restricted apps to display format
  // Separate custom apps (blank) from non-custom apps
  const allRestrictedApps = (Array.isArray(restrictedApps) ? restrictedApps : [])
    .filter(app => app && app.slug) // Filter out invalid apps
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
      atoms_in_molecules: app.atoms_in_molecules || []
    }))
    .filter(app => app.id); // Remove any that failed transformation

  // Separate custom restricted apps (for Tenant section) from non-custom (for QM section)
  const customRestrictedApps = allRestrictedApps.filter(app => app.custom);
  const displayRestrictedApps = allRestrictedApps.filter(app => !app.custom);

  const filteredRestrictedApps = displayRestrictedApps.filter(app => {
    if (!app.title || !app.description) return false;
    const matchesSearch = app.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         app.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || app.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredCustomRestrictedApps = customRestrictedApps.filter(app => {
    if (!app.title || !app.description) return false;
    const matchesSearch = app.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         app.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || app.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Transform unavailable apps to display format
  // Separate custom apps (blank) from non-custom apps
  const allUnavailableApps = (Array.isArray(unavailableApps) ? unavailableApps : [])
    .filter(app => app && app.slug && app.usecase_id) // Filter out invalid apps
    .map(app => ({
      id: `usecase-${app.usecase_id}`, // Use usecase_id with prefix to avoid clashing
      usecase_id: app.usecase_id, // Store usecase_id for future reference
      title: app.name || 'Unknown App',
      description: app.description || '',
      icon: getAppIcon(app.slug || ''),
      color: getAppColor(app.slug || ''),
      category: getAppCategory(app.slug || ''),
      featured: false,
      custom: app.slug === 'blank',
      modules: app.modules || [],
      molecules: app.molecules || [],
      atoms_in_molecules: app.atoms_in_molecules || []
    }))
    .filter(app => app.id && app.usecase_id); // Remove any that failed transformation

  // Separate custom unavailable apps (for Tenant section) from non-custom (for QM section)
  const customUnavailableApps = allUnavailableApps.filter(app => app.custom);
  const displayUnavailableApps = allUnavailableApps.filter(app => !app.custom);

  const filteredUnavailableApps = displayUnavailableApps.filter(app => {
    if (!app.title || !app.description) return false;
    const matchesSearch = app.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         app.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || app.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredCustomUnavailableApps = customUnavailableApps.filter(app => {
    if (!app.title || !app.description) return false;
    const matchesSearch = app.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         app.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || app.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Filter recent projects based on search term and category
  const filteredRecentProjects = recentProjectsState.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.appTitle.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || getAppCategory(project.appId) === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredMyProjects = myProjectsState.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.appTitle.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || getAppCategory(project.appId) === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const animationStyle = (offset: number) => ({
    animationDelay: `${(introBaseDelay + offset).toFixed(1)}s`,
    animationFillMode: 'both' as const,
    ...(playIntro ? { opacity: 0 } : {}),
  });

  // Calculate sidebar width based on state
  const sidebarWidth = sidebarOpen ? 260 : 48; // 48px (icon) + 212px (expanded) = 260px when open

  return (
    <div className="relative bg-background">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-50 animate-slide-in-from-top" style={animationStyle(0.2)}>
        <Header 
          sidebarOpen={sidebarOpen}
          onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
        />
      </div>

      {/* Fixed Sidebar */}
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

      {/* Main Content - Normal document flow with margins */}
      <div 
        className="relative z-10"
        style={{
          marginTop: '80px',
          marginLeft: `${sidebarWidth}px`,
        }}
      >
            {/* Search & Filters */}
              <div className="max-w-7xl mx-auto px-6 pt-8 pb-6">
            <div className="animate-fade-in" style={animationStyle(0.4)}>
              <div className="flex items-center gap-4">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <Input
                    type="text"
                    placeholder="Search projects and applications..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9 bg-muted/30 border-border/50 focus:border-primary/50 focus:bg-card text-sm"
                  />
                </div>
                
                {/* Category Pills */}
                <div className="flex items-center gap-2 shrink-0">
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
          </div>

          {/* Workspace Tabs Component */}
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

          <div className="max-w-7xl mx-auto px-6 py-8 pb-20">
            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-8 animate-fade-in" style={animationStyle(0.4)}>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-3 text-muted-foreground">Loading applications...</span>
              </div>
            )}

          {/* Background section starting from Custom Applications */}
          <div className="bg-gradient-to-br from-muted/40 via-muted/30 to-muted/40 -mx-6 px-6 py-8 mt-8 pb-20">
            {/* Custom Applications */}
            {!loading && (customApps.length > 0 || filteredCustomRestrictedApps.length > 0 || filteredCustomUnavailableApps.length > 0) && (
              <div id="custom-applications-section" className="animate-fade-in scroll-mt-8" style={animationStyle(1.0)}>
                <div className="flex items-center gap-2 mb-6">
                  <Plus className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-bold text-foreground">{tenantName || 'Custom'} Applications</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Regular custom apps */}
                  {customApps.map((app, index) => {
                    const Icon = app.icon;
                    return (
                      <Card 
                        key={app.id}
                        className="group relative bg-card border border-dashed border-border hover:border-primary/50 shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden hover:-translate-y-1 cursor-pointer animate-scale-in"
                        style={animationStyle(1.1 + index * 0.05)}
                        onClick={() => handleAppSelect(app.id)}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        
                        <div className="relative p-4">
                          {/* Info Icon in top right */}
                          <div className="absolute top-4 right-4 z-10">
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                    }}
                                    className="w-6 h-6 rounded-full bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors"
                                  >
                                    <Info className="w-3.5 h-3.5 text-muted-foreground" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent 
                                  side="left" 
                                  sideOffset={8}
                                  className="max-w-xs text-xs z-[9999]"
                                >
                                  <p>{app.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>

                          <div className="flex items-start gap-3">
                            <div className={`${app.color} w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-110 transition-transform duration-300`}>
                              <Icon className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0 pr-8 flex flex-col gap-2">
                              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-tight">
                                {app.title}
                              </h3>
                              <Button 
                                variant="ghost"
                                size="sm"
                                className="w-fit font-normal h-7 px-2 text-xs group-hover:bg-primary/5 group-hover:text-primary transition-colors -ml-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAppSelect(app.id);
                                }}
                              >
                                Get Started
                                <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                  {/* Custom restricted apps */}
                  {filteredCustomRestrictedApps.map((app, index) => {
                    const Icon = app.icon;
                    return (
                      <Card 
                        key={app.id}
                        className="group relative bg-card border border-dashed border-border/50 opacity-40 cursor-not-allowed animate-scale-in"
                        style={animationStyle(1.1 + (customApps.length + index) * 0.05)}
                      >
                        <div className="relative p-4">
                          {/* Info Icon in top right */}
                          <div className="absolute top-4 right-4 z-10">
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    className="w-6 h-6 rounded-full bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors cursor-default"
                                  >
                                    <Info className="w-3.5 h-3.5 text-muted-foreground" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent 
                                  side="left" 
                                  sideOffset={8}
                                  className="max-w-xs text-xs z-[9999]"
                                >
                                  <p>{app.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>

                          <div className="flex items-start gap-3">
                            <div className="bg-gray-500 w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md transition-transform duration-300">
                              <Icon className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0 pr-8 flex flex-col gap-2">
                              <h3 className="text-sm font-semibold text-muted-foreground leading-tight">
                                {app.title}
                              </h3>
                              <Button 
                                variant="ghost"
                                size="sm"
                                className="w-fit h-7 px-2 text-xs text-muted-foreground -ml-2"
                                disabled
                              >
                                Restricted
                                <Lock className="w-3 h-3 ml-1" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                  {/* Custom unavailable apps */}
                  {filteredCustomUnavailableApps.map((app, index) => {
                    const Icon = app.icon;
                    return (
                      <Card 
                        key={app.id}
                        className="group relative bg-card border border-dashed border-border/50 opacity-60 cursor-not-allowed animate-scale-in"
                        style={animationStyle(1.1 + (customApps.length + filteredCustomRestrictedApps.length + index) * 0.05)}
                      >
                        <div className="relative p-4">
                          {/* Info Icon in top right */}
                          <div className="absolute top-4 right-4 z-10">
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    className="w-6 h-6 rounded-full bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors cursor-default"
                                  >
                                    <Info className="w-3.5 h-3.5 text-muted-foreground" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent 
                                  side="left" 
                                  sideOffset={8}
                                  className="max-w-xs text-xs z-[9999]"
                                >
                                  <p>{app.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>

                          <div className="flex items-start gap-3">
                            <div className="bg-gray-400 w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md transition-transform duration-300">
                              <Icon className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0 pr-8 flex flex-col gap-2">
                              <h3 className="text-sm font-semibold text-muted-foreground leading-tight">
                                {app.title}
                              </h3>
                              <Button 
                                variant="ghost"
                                size="sm"
                                className="w-fit h-7 px-2 text-xs text-muted-foreground -ml-2"
                                disabled
                              >
                                Not Available
                                <Lock className="w-3 h-3 ml-1" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                  {/* Placeholder Cards */}
                  {[
                    { id: 'placeholder-1', title: 'Data Analytics Pro', color: 'bg-indigo-600', icon: Database },
                    { id: 'placeholder-2', title: 'Business Intelligence', color: 'bg-purple-600', icon: BarChart3 },
                  ].map((placeholder, index) => {
                    const PlaceholderIcon = placeholder.icon;
                    return (
                      <Card 
                        key={placeholder.id}
                        className="group relative bg-card border border-dashed border-border/50 hover:border-primary/50 hover:shadow-xl transition-all duration-300 overflow-hidden hover-scale cursor-pointer animate-scale-in opacity-60"
                        style={animationStyle(1.1 + (customApps.length + filteredCustomRestrictedApps.length + filteredCustomUnavailableApps.length + index) * 0.05)}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        
                        <div className="relative p-4">
                          <div className="flex items-start gap-3">
                            <div className={`${placeholder.color} w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-110 transition-transform duration-300`}>
                              <PlaceholderIcon className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0 pr-8 flex flex-col gap-2">
                              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-tight">
                                {placeholder.title}
                              </h3>
                              <Button 
                                variant="ghost"
                                size="sm"
                                className="w-fit h-7 px-2 text-xs group-hover:bg-primary/5 group-hover:text-primary transition-colors -ml-2"
                                disabled
                              >
                                Coming Soon
                                <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* QM Applications - Merged section with QM, Restricted, and Unavailable apps */}
            {(!loading && filteredApps.length > 0) || (!loadingRestricted && filteredRestrictedApps.length > 0) || (!loadingUnavailable && filteredUnavailableApps.length > 0) ? (
              <div id="all-applications-section" className="mt-10 mb-12 animate-fade-in scroll-mt-8" style={animationStyle(1.4)}>
                <div className="flex items-center gap-2 mb-6">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-bold text-foreground">QM Applications</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* QM Applications */}
                  {filteredApps.map((app, index) => {
                    const Icon = app.icon;
                    return (
                      <Card 
                        key={app.id}
                        className="group relative bg-card border border-border hover:border-primary/50 shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden hover:-translate-y-1 cursor-pointer animate-scale-in"
                        style={animationStyle(1.5 + index * 0.05)}
                        onClick={() => handleAppSelect(app.id)}
                      >
                        {/* Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        
                        <div className="relative p-4">
                          {/* Info Icon in top right */}
                          <div className="absolute top-4 right-4 z-10">
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                    }}
                                    className="w-6 h-6 rounded-full bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors"
                                  >
                                    <Info className="w-3.5 h-3.5 text-muted-foreground" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent 
                                  side="left" 
                                  sideOffset={8}
                                  className="max-w-xs text-xs z-[9999]"
                                >
                                  <p>{app.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>

                          <div className="flex items-start gap-3">
                            <div className={`${app.color} w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-110 transition-transform duration-300`}>
                              <Icon className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0 pr-8 flex flex-col gap-2">
                              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-tight">
                                {app.title}
                              </h3>
                              <Button 
                                variant="ghost"
                                size="sm"
                                className="w-fit h-7 px-2 text-xs group-hover:bg-primary/5 group-hover:text-primary transition-colors -ml-2"
                                disabled={true}
                              >
                                Get Started
                                <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                  {/* Restricted Applications */}
                  {filteredRestrictedApps.map((app, index) => {
                    const Icon = app.icon;
                    return (
                      <Card 
                        key={app.id}
                        className="group relative bg-card border border-border/50 opacity-40 cursor-not-allowed animate-scale-in"
                        style={animationStyle(1.5 + (filteredApps.length + index) * 0.05)}
                      >
                        <div className="relative p-4">
                          {/* Info Icon in top right */}
                          <div className="absolute top-4 right-4 z-10">
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    className="w-6 h-6 rounded-full bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors cursor-default"
                                  >
                                    <Info className="w-3.5 h-3.5 text-muted-foreground" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent 
                                  side="left" 
                                  sideOffset={8}
                                  className="max-w-xs text-xs z-[9999]"
                                >
                                  <p>{app.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>

                          <div className="flex items-start gap-3">
                            <div className="bg-gray-500 w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md transition-transform duration-300">
                              <Icon className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0 pr-8 flex flex-col gap-2">
                              <h3 className="text-sm font-semibold text-muted-foreground leading-tight">
                                {app.title}
                              </h3>
                              <Button 
                                variant="ghost"
                                size="sm"
                                className="w-fit h-7 px-2 text-xs text-muted-foreground -ml-2"
                                disabled
                              >
                                Restricted
                                <Lock className="w-3 h-3 ml-1" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                  {/* Unavailable Applications */}
                  {filteredUnavailableApps.map((app, index) => {
                    const Icon = app.icon;
                    return (
                      <Card 
                        key={app.id}
                        className="group relative bg-card border border-border/50 opacity-60 cursor-not-allowed animate-scale-in"
                        style={animationStyle(1.5 + (filteredApps.length + filteredRestrictedApps.length + index) * 0.05)}
                      >
                        <div className="relative p-4">
                          {/* Info Icon in top right */}
                          <div className="absolute top-4 right-4 z-10">
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    className="w-6 h-6 rounded-full bg-muted/50 hover:bg-muted flex items-center justify-center transition-colors cursor-default"
                                  >
                                    <Info className="w-3.5 h-3.5 text-muted-foreground" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent 
                                  side="left" 
                                  sideOffset={8}
                                  className="max-w-xs text-xs z-[9999]"
                                >
                                  <p>{app.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>

                          <div className="flex items-start gap-3">
                            <div className="bg-gray-400 w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md transition-transform duration-300">
                              <Icon className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0 pr-8 flex flex-col gap-2">
                              <h3 className="text-sm font-semibold text-muted-foreground leading-tight">
                                {app.title}
                              </h3>
                              <Button 
                                variant="ghost"
                                size="sm"
                                className="w-fit h-7 px-2 text-xs text-muted-foreground -ml-2"
                                disabled
                              >
                                Not Available
                                <Lock className="w-3 h-3 ml-1" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ) : null}


            {/* No Results */}
            {!loading && !loadingRestricted && !loadingUnavailable && filteredApps.length === 0 && filteredRestrictedApps.length === 0 && filteredUnavailableApps.length === 0 && (
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
          </div>
      </div>
      
      {/* Create New Project Dialog */}
          <CreateNewProject 
            open={createProjectOpen} 
            onOpenChange={setCreateProjectOpen}
            apps={displayApps}
            appMap={appMap}
            tenantName={tenantName}
          />
    </div>
  );
};

export default Apps;