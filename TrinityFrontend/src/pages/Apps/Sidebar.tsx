import React from 'react';
import { LayoutGrid, User, Building2, Plus, Sparkles, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  activeTab: 'workspace' | 'my-projects';
  setActiveTab: (tab: 'workspace' | 'my-projects') => void;
  userName: string | null;
  user: { username: string } | null;
  tenantName: string | null;
  myProjectsCount: number;
  recentProjectsCount: number;
  appsCount: number;
}

const Sidebar: React.FC<SidebarProps> = ({
  sidebarOpen,
  setSidebarOpen,
  activeTab,
  setActiveTab,
  userName,
  user,
  tenantName,
  myProjectsCount,
  recentProjectsCount,
  appsCount,
}) => {
  return (
    <div
      className="fixed left-0 z-40 flex overflow-hidden"
      style={{
        top: '52px',
        height: 'calc(100vh - 80px)',
      }}
    >
      {/* Fixed Icon Column - Always Visible */}
      <div className="w-[48px] bg-card border-r border-border flex flex-col shrink-0 overflow-hidden">
        <div className="flex flex-col h-full items-center pt-4 pb-4">
          {/* Grid Icon - Activates Sidebar */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-10 h-10 flex items-center justify-center rounded-lg transition-colors text-foreground hover:bg-muted"
            title={sidebarOpen ? "Collapse Sidebar" : "Open Sidebar"}
            aria-label={sidebarOpen ? "Collapse Sidebar" : "Open Sidebar"}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expandable Content Panel */}
      <div 
        className={cn(
          "bg-card border-r border-border flex flex-col shrink-0 overflow-hidden",
          sidebarOpen ? "w-[212px]" : "w-0"
        )}
      >
        <div className={cn(
          "flex flex-col h-full relative pt-4 pb-4 px-4",
          !sidebarOpen && "opacity-0 pointer-events-none"
        )}>
          {/* Menu Options */}
          <div className="flex-1 space-y-1">
            <button
              onClick={() => setActiveTab('my-projects')}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                activeTab === 'my-projects'
                  ? "bg-yellow-100 text-foreground"
                  : "text-foreground hover:bg-muted"
              )}
            >
              <User className="w-4 h-4 shrink-0" style={{ color: '#FFE28A' }} />
              <span className="truncate">Your Workspace</span>
            </button>
            <button
              onClick={() => setActiveTab('workspace')}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                activeTab === 'workspace'
                  ? "bg-blue-100 text-foreground"
                  : "text-foreground hover:bg-muted"
              )}
            >
              <Building2 className="w-4 h-4 shrink-0 text-blue-400" />
              <span className="truncate">{tenantName || 'Companies'} Workspace</span>
            </button>
            
            {/* Divider */}
            <div className="my-2 border-t border-border"></div>
            
            {/* Application Navigation */}
            <button
              onClick={() => {
                setSidebarOpen(true);
                setTimeout(() => {
                  const element = document.getElementById('custom-applications-section');
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }, 0);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-foreground hover:bg-muted"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="truncate">{tenantName || 'Custom'} Application</span>
            </button>
            <button
              onClick={() => {
                setSidebarOpen(true);
                setTimeout(() => {
                  const element = document.getElementById('all-applications-section');
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }, 0);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-foreground hover:bg-muted"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span className="truncate">QM Application</span>
            </button>
          </div>

          {/* User Info - At Bottom */}
          <div className="mt-auto pt-4 pb-4 border-t border-border">
            <div className="flex items-center justify-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
                {(userName || user?.username || 'User').charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-semibold">{userName || user?.username || 'User'}</span>
            </div>
          </div>

          {/* Project Statistics - At Bottom */}
          <div className="pt-4 border-t border-border">
            <h3 className="text-xs font-semibold text-foreground mb-2">Project Statistics</h3>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Your Projects</span>
                <span className="font-medium">{myProjectsCount}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Company Projects</span>
                <span className="font-medium">{recentProjectsCount}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Total Applications</span>
                <span className="font-medium">{appsCount}</span>
              </div>
            </div>
          </div>

          {/* Collapse Button - Down Arrow at Bottom */}
          <div className="mt-4 pt-4 border-t border-border">
            <button
              onClick={() => setSidebarOpen(false)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-foreground hover:bg-muted"
              title="Collapse Sidebar"
              aria-label="Collapse Sidebar"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;

