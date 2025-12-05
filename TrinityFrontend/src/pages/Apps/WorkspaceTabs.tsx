import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, ChevronRight, Plus, User, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import HorizontalScrollContainer from './HorizontalScrollContainer';

interface ModeStatus {
  workflow: boolean;
  laboratory: boolean;
  exhibition: boolean;
}

interface Project {
  id: string;
  name: string;
  appId: string;
  appTitle: string;
  lastModified: Date;
  relativeTime?: string;
  icon: any;
  modes: ModeStatus;
}

interface WorkspaceTabsProps {
  activeTab: 'workspace' | 'my-projects';
  setActiveTab: (tab: 'workspace' | 'my-projects') => void;
  filteredMyProjects: Project[];
  filteredRecentProjects: Project[];
  loadingMyProjects: boolean;
  loadingRecentProjects: boolean;
  searchTerm: string;
  selectedCategory: string;
  tenantName: string | null;
  onOpenProject: (project: Project) => void;
  onCreateProject: () => void;
  getAppColorValue: (slug: string) => string;
  formatRelativeTime: (date: Date) => string;
  animationStyle: (offset: number) => React.CSSProperties;
}

const WorkspaceTabs: React.FC<WorkspaceTabsProps> = ({
  activeTab,
  setActiveTab,
  filteredMyProjects,
  filteredRecentProjects,
  loadingMyProjects,
  loadingRecentProjects,
  searchTerm,
  selectedCategory,
  tenantName,
  onOpenProject,
  onCreateProject,
  getAppColorValue,
  formatRelativeTime,
  animationStyle,
}) => {
  const tabButtonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [pillStyle, setPillStyle] = useState({ width: 0, left: 0 });

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
    <>
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
                    onClick={onCreateProject}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create New Project
                  </Button>
                </div>
                
                {/* Loading State */}
                {loadingMyProjects ? (
                  <div className="flex items-center justify-center py-12 animate-fade-in">
                    <div className="flex flex-col items-center gap-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      <p className="text-muted-foreground text-sm">Loading your recent project data...</p>
                    </div>
                  </div>
                ) : filteredMyProjects.length > 0 ? (
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
                          onClick={() => onOpenProject(project)}
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
                    onClick={onCreateProject}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create New Project
                  </Button>
                </div>
                
                {/* Loading State */}
                {loadingRecentProjects ? (
                  <div className="flex items-center justify-center py-12 animate-fade-in">
                    <div className="flex flex-col items-center gap-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      <p className="text-muted-foreground text-sm">Loading {tenantName || 'Companies'} recent project data...</p>
                    </div>
                  </div>
                ) : filteredRecentProjects.length > 0 ? (
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
                          onClick={() => onOpenProject(project)}
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
    </>
  );
};

export default WorkspaceTabs;

