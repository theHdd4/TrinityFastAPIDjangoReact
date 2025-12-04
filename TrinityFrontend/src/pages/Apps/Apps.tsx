import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Target, Zap, Plus, ArrowRight, Search, TrendingUp, Brain, Users, ShoppingCart, LineChart, PieChart, Database, Sparkles, Layers, DollarSign, Megaphone, Monitor, LayoutGrid, Clock, Calendar, ChevronRight, ChevronLeft, ChevronDown, GitBranch, FlaskConical, Presentation, Info, User, Building2, PanelLeft } from 'lucide-react';
import Header from '@/components/Header';
import { REGISTRY_API, TENANTS_API, ACCOUNTS_API } from '@/lib/api';
import { LOGIN_ANIMATION_TOTAL_DURATION } from '@/constants/loginAnimation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { openProjectAndNavigate } from '@/utils/openProject';
import CreateNewProject from './CreateNewProject';
import Sidebar from './Sidebar';

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

// Horizontal Scroll Container Component
interface HorizontalScrollContainerProps {
  children: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}

const HorizontalScrollContainer: React.FC<HorizontalScrollContainerProps> = ({ 
  children, 
  className = '',
  'aria-label': ariaLabel = 'Scrollable content'
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchScrollLeft, setTouchScrollLeft] = useState(0);

  const updateScrollButtons = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = scrollRef.current.clientWidth * 0.8;
    const targetScroll = direction === 'left' 
      ? scrollRef.current.scrollLeft - scrollAmount
      : scrollRef.current.scrollLeft + scrollAmount;
    
    scrollRef.current.scrollTo({
      left: targetScroll,
      behavior: 'smooth'
    });
  };

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
    scrollRef.current.style.cursor = 'grabbing';
    scrollRef.current.style.userSelect = 'none';
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    if (scrollRef.current) {
      scrollRef.current.style.cursor = 'grab';
      scrollRef.current.style.userSelect = '';
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (scrollRef.current) {
      scrollRef.current.style.cursor = 'grab';
      scrollRef.current.style.userSelect = '';
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!scrollRef.current) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      scrollRef.current.scrollBy({ left: -300, behavior: 'smooth' });
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      scrollRef.current.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!scrollRef.current) return;
    setTouchStart(e.touches[0].pageX);
    setTouchScrollLeft(scrollRef.current.scrollLeft);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!scrollRef.current) return;
    const touchCurrent = e.touches[0].pageX;
    const touchDiff = touchStart - touchCurrent;
    scrollRef.current.scrollLeft = touchScrollLeft + touchDiff;
  };

  // Update visible count
  useEffect(() => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const cards = container.querySelectorAll('[data-scroll-card]');
    setTotalCount(cards.length);
    
    const updateVisibleCount = () => {
      const containerRect = container.getBoundingClientRect();
      let visible = 0;
      cards.forEach((card) => {
        const cardRect = card.getBoundingClientRect();
        if (cardRect.left < containerRect.right && cardRect.right > containerRect.left) {
          visible++;
        }
      });
      setVisibleCount(visible);
    };

    updateVisibleCount();
    const observer = new ResizeObserver(updateVisibleCount);
    observer.observe(container);
    
    return () => observer.disconnect();
  }, [children]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    updateScrollButtons();
    container.addEventListener('scroll', updateScrollButtons);
    window.addEventListener('resize', updateScrollButtons);

    return () => {
      container.removeEventListener('scroll', updateScrollButtons);
      window.removeEventListener('resize', updateScrollButtons);
    };
  }, [updateScrollButtons, children]);

  return (
    <div className={cn("relative", className)}>
      {/* Left Gradient Mask */}
      {canScrollLeft && (
        <div 
          className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background via-background/80 to-transparent pointer-events-none z-10 transition-opacity duration-200"
          aria-hidden="true"
        />
      )}
      
      {/* Right Gradient Mask */}
      {canScrollRight && (
        <div 
          className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background via-background/80 to-transparent pointer-events-none z-10 transition-opacity duration-200"
          aria-hidden="true"
        />
      )}

      {/* Arrow Buttons - Show on scroll area hover */}
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-background/95 backdrop-blur-sm border border-border shadow-lg flex items-center justify-center text-foreground hover:bg-card hover:scale-110 transition-all duration-200 opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          aria-label="Scroll left"
          type="button"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-background/95 backdrop-blur-sm border border-border shadow-lg flex items-center justify-center text-foreground hover:bg-card hover:scale-110 transition-all duration-200 opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          aria-label="Scroll right"
          type="button"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      {/* Scrollable Container */}
      <div
        ref={scrollRef}
        className={cn(
          "overflow-x-auto overflow-y-hidden group",
          "scroll-smooth",
          "cursor-grab active:cursor-grabbing",
          "select-none",
          "[&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2",
          "[&::-webkit-scrollbar-track]:bg-transparent",
          "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#FFBD59]/60",
          "hover:[&::-webkit-scrollbar-thumb]:bg-[#FFBD59]/80",
          "[scrollbar-width:thin] [scrollbar-color:#FFBD59_transparent]"
        )}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onKeyDown={handleKeyDown}
        onScroll={updateScrollButtons}
        tabIndex={0}
        role="region"
        aria-label={ariaLabel}
        aria-live="polite"
        style={{
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div 
          className="flex gap-4 pt-2 pb-4"
          style={{
            scrollSnapAlign: 'start',
          }}
        >
          {React.Children.map(children, (child, index) => (
            <div
              key={index}
              data-scroll-card
              className="flex-shrink-0"
              style={{
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
              }}
            >
              {child}
            </div>
          ))}
        </div>
      </div>

      {/* Screen Reader Announcement */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {visibleCount > 0 && totalCount > 0 && (
          <span>
            Showing {visibleCount} of {totalCount} items
          </span>
        )}
      </div>
    </div>
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
  const tabButtonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [pillStyle, setPillStyle] = useState({ width: 0, left: 0 });
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
      
      // Fetch tenant information
      const fetchTenantInfo = async () => {
        try {
          const res = await fetch(`${TENANTS_API}/tenants/`, {
            credentials: 'include',
          });
          if (res.ok) {
            const tenantsData = await res.json();
            if (Array.isArray(tenantsData) && tenantsData.length > 0) {
              const name = tenantsData[0].name;
              setTenantName(name);
              console.log('🏢 Tenant Name:', name);
            } else {
              console.log('⚠️ No tenant data found');
            }
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

      console.log('🔍 Fetching recent projects from registry API...');
      // Fetch recent projects with backend sorting (no limit - fetch all)
      const apiUrl = `${REGISTRY_API}/projects/?ordering=-updated_at`;
      console.log('🔗 API URL:', apiUrl);
      console.log('👤 User:', user.username);
      
      try {
        // Fetch recent projects (sorted by updated_at desc, limited to 4)
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

      console.log('🔍 Fetching user-specific projects from registry API...');
      // Fetch user-specific projects with scope=user parameter (no limit - fetch all)
      const apiUrl = `${REGISTRY_API}/projects/?scope=user&ordering=-updated_at`;
      console.log('🔗 API URL:', apiUrl);
      console.log('👤 User:', user.username);
      
      try {
        // Fetch user-specific projects (sorted by updated_at desc, limited to 4)
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

  // Workspace items configuration
  const workspaceItems = [
    { 
      id: 'my-projects' as const, 
      label: 'Your Workspace', 
      Icon: User, 
      bg: '#FFF4D6', 
      iconColor: '#FFE28A',
      description: 'Your recent work'
    },
    { 
      id: 'workspace' as const, 
      label: `${tenantName || 'Companies'} Workspace`, 
      Icon: Building2, 
      bg: '#DBEAFE', 
      iconColor: '#60A5FA',
      description: 'Continue where you left off'
    },
  ];

  const myWorkspaceItem = workspaceItems[0];
  const companiesWorkspaceItem = workspaceItems[1];

  // Update pill dimensions based on active tab
  const updatePillDimensions = useCallback(() => {
    const activeButton = tabButtonRefs.current[activeTab];
    const container = tabsContainerRef.current;
    
    if (activeButton && container) {
      const buttonRect = activeButton.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      
      setPillStyle({
        width: buttonRect.width,
        left: buttonRect.left - containerRect.left,
      });
    }
  }, [activeTab]);

  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM is ready
    const rafId = requestAnimationFrame(() => {
      // Initial calculation
      updatePillDimensions();
      
      // Additional attempts to ensure dimensions are calculated
      // Sometimes the DOM needs multiple frames to be fully laid out
      setTimeout(updatePillDimensions, 0);
      setTimeout(updatePillDimensions, 10);
      setTimeout(updatePillDimensions, 50);
    });

    // Recalculate on window resize
    window.addEventListener('resize', updatePillDimensions);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updatePillDimensions);
    };
  }, [updatePillDimensions]);

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

          {/* Workspace Tabs - Shared above both sections */}
          <div className="max-w-7xl mx-auto px-6 pt-8 pb-4">
            <div ref={tabsContainerRef} className="relative inline-flex items-center gap-2 p-1 bg-muted/50 rounded-full">
              {/* Sliding Pill Background */}
              {pillStyle.width > 0 && (
                <div
                  className="absolute top-1 bottom-1 rounded-full bg-white shadow-sm transition-all duration-300 ease-out"
                  style={{
                    left: `${pillStyle.left}px`,
                    width: `${pillStyle.width}px`,
                  }}
                />
              )}
              
              {workspaceItems.map((item) => {
                const isActive = item.id === activeTab;
                return (
                  <button
                    key={item.id}
                    ref={(el) => {
                      tabButtonRefs.current[item.id] = el;
                      // Trigger pill calculation when active button is mounted
                      if (isActive && el) {
                        // Use requestAnimationFrame to ensure layout is complete
                        requestAnimationFrame(() => {
                          updatePillDimensions();
                        });
                      }
                    }}
                    onClick={() => setActiveTab(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveTab(item.id);
                      }
                    }}
                    className={cn(
                      "relative z-10 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200",
                      isActive 
                        ? "text-foreground" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    aria-pressed={isActive}
                    aria-label={`Switch to ${item.label}`}
                  >
                    <item.Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Your Workspace Section - Independent rendering */}
          {activeTab === 'my-projects' && (
            <section className="bg-muted/30 animate-fade-in" style={animationStyle(0.3)}>
              <div className="max-w-7xl mx-auto px-6 py-8">
                {/* Workspace Content with Uniform Background */}
                <div className="relative mb-6">
                  {/* Uniform background */}
                  <div className="absolute inset-0 -mx-6 -mt-2 px-6 pt-2 pb-6 rounded-3xl bg-blue-50/40 border border-blue-100/50" />
                  
                  {/* Content above background */}
                  <div className="relative z-10 py-6 px-2">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors duration-200"
                          style={{ backgroundColor: myWorkspaceItem.bg }}
                        >
                          <myWorkspaceItem.Icon 
                            className="w-4.5 h-4.5" 
                            style={{ color: myWorkspaceItem.iconColor }} 
                          />
                        </div>
                        <div>
                          <h2 className="text-base font-semibold text-foreground">
                            {myWorkspaceItem.label}
                          </h2>
                          <p className="text-xs text-muted-foreground">
                            {myWorkspaceItem.description}
                          </p>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-xs bg-[#FFBD59] hover:bg-[#FFA726] text-gray-800 font-medium h-8 gap-1.5 shadow-md hover:shadow-lg shadow-[#FFBD59]/30 hover:shadow-[#FFBD59]/40 transition-all duration-300 hover:scale-105"
                        onClick={() => setCreateProjectOpen(true)}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Create New Project
                      </Button>
                    </div>
                    
                    {/* Show projects if available, otherwise show empty state */}
                    {filteredMyProjects.length > 0 ? (
                      <HorizontalScrollContainer
                        aria-label="Your Workspace projects"
                      >
                        {filteredMyProjects.map((project) => {
                          const Icon = project.icon;
                          const appColorValue = getAppColorValue(project.appId);
                          return (
                            <Card
                              key={project.id}
                              className={cn(
                                "group bg-card cursor-pointer overflow-hidden",
                                "w-[280px] sm:w-[300px] lg:w-[320px]",
                                "border border-border/50 hover:border-primary/40",
                                "shadow-sm hover:shadow-[0_12px_28px_rgba(var(--color-primary-rgb, 59,130,246),0.12)]",
                                "transition-all duration-300 hover:-translate-y-2"
                              )}
                              onClick={() => openRecentProject(project)}
                            >
                              <div className="p-4">
                                <div className="flex items-start gap-3 mb-4">
                                  <div 
                                    className={cn(
                                      "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                                      "text-white",
                                      "transition-all duration-300",
                                      "group-hover:scale-105"
                                    )}
                                    style={{
                                      backgroundColor: appColorValue,
                                    }}
                                  >
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
                                
                                <div className="flex items-center justify-between pt-3 border-t border-border/40">
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Calendar className="w-3 h-3" />
                                    <span className="text-[10px] font-medium">{project.relativeTime || formatRelativeTime(project.lastModified)}</span>
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
                      </HorizontalScrollContainer>
                    ) : (
                      <div className="text-center py-12">
                        <p className="text-muted-foreground text-sm">
                          {(searchTerm || selectedCategory !== 'all')
                            ? `No projects found matching your filters. Try adjusting your search or category selection.`
                            : 'No projects found. Create or modify a project to see it here.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Companies Workspace Section - Independent rendering */}
          {activeTab === 'workspace' && (
            <section className="bg-muted/30 animate-fade-in" style={animationStyle(0.3)}>
              <div className="max-w-7xl mx-auto px-6 py-8">
                {/* Workspace Content with Uniform Background */}
                <div className="relative mb-6">
                  {/* Uniform background */}
                  <div className="absolute inset-0 -mx-6 -mt-2 px-6 pt-2 pb-6 rounded-3xl bg-blue-50/40 border border-blue-100/50" />
                  
                  {/* Content above background */}
                  <div className="relative z-10 py-6 px-2">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors duration-200"
                          style={{ backgroundColor: companiesWorkspaceItem.bg }}
                        >
                          <companiesWorkspaceItem.Icon 
                            className="w-4.5 h-4.5" 
                            style={{ color: companiesWorkspaceItem.iconColor }} 
                          />
                        </div>
                        <div>
                          <h2 className="text-base font-semibold text-foreground">
                            {companiesWorkspaceItem.label}
                          </h2>
                          <p className="text-xs text-muted-foreground">
                            {companiesWorkspaceItem.description}
                          </p>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-xs bg-[#FFBD59] hover:bg-[#FFA726] text-gray-800 font-medium h-8 gap-1.5 shadow-md hover:shadow-lg shadow-[#FFBD59]/30 hover:shadow-[#FFBD59]/40 transition-all duration-300 hover:scale-105"
                        onClick={() => setCreateProjectOpen(true)}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Create New Project
                      </Button>
                    </div>
                    
                    {/* Show projects if available, otherwise show empty state */}
                    {filteredRecentProjects.length > 0 ? (
                      <HorizontalScrollContainer
                        aria-label={`${tenantName || 'Companies'} Workspace projects`}
                      >
                        {filteredRecentProjects.map((project) => {
                          const Icon = project.icon;
                          const appColorValue = getAppColorValue(project.appId);
                          return (
                            <Card
                              key={project.id}
                              className={cn(
                                "group bg-card cursor-pointer overflow-hidden",
                                "w-[280px] sm:w-[300px] lg:w-[320px]",
                                "border border-border/50 hover:border-primary/40",
                                "shadow-sm hover:shadow-[0_12px_28px_rgba(var(--color-primary-rgb, 59,130,246),0.12)]",
                                "transition-all duration-300 hover:-translate-y-2"
                              )}
                              onClick={() => openRecentProject(project)}
                            >
                              <div className="p-4">
                                <div className="flex items-start gap-3 mb-4">
                                  <div 
                                    className={cn(
                                      "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                                      "text-white",
                                      "transition-all duration-300",
                                      "group-hover:scale-105"
                                    )}
                                    style={{
                                      backgroundColor: appColorValue,
                                    }}
                                  >
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
                                
                                <div className="flex items-center justify-between pt-3 border-t border-border/40">
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Calendar className="w-3 h-3" />
                                    <span className="text-[10px] font-medium">{project.relativeTime || formatRelativeTime(project.lastModified)}</span>
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
                      </HorizontalScrollContainer>
                    ) : (
                      <div className="text-center py-12">
                        <p className="text-muted-foreground text-sm">
                          {(searchTerm || selectedCategory !== 'all')
                            ? `No projects found matching your filters. Try adjusting your search or category selection.`
                            : 'No recent projects. Start a new project to see it here.'}
                        </p>
                      </div>
                    )}
                  </div>
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

          {/* Background section starting from Custom Applications */}
          <div className="bg-gradient-to-br from-muted/40 via-muted/30 to-muted/40 -mx-6 px-6 py-8 mt-8 pb-20">
            {/* Custom Applications */}
            {!loading && customApps.length > 0 && (
              <div id="custom-applications-section" className="animate-fade-in scroll-mt-8" style={animationStyle(1.0)}>
                <div className="flex items-center gap-2 mb-6">
                  <Plus className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-bold text-foreground">{tenantName || 'Custom'} Applications</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                        style={animationStyle(1.1 + (customApps.length + index) * 0.05)}
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

            {/* QM Applications */}
            {!loading && filteredApps.length > 0 && (
              <div id="all-applications-section" className="mt-10 mb-12 animate-fade-in scroll-mt-8" style={animationStyle(1.4)}>
                <div className="flex items-center gap-2 mb-6">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-bold text-foreground">QM Applications</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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