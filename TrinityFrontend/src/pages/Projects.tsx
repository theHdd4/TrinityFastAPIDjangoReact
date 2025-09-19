import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Header from '@/components/Header';
import GreenGlyphRain from '@/components/animations/GreenGlyphRain';
import { REGISTRY_API } from '@/lib/api';
import { LOGIN_ANIMATION_TOTAL_DURATION } from '@/constants/loginAnimation';
import { clearProjectState, saveCurrentProject } from '@/utils/projectStorage';
import {
  Plus,
  FolderOpen,
  Target,
  BarChart3,
  Zap,
  Clock,
  Loader2,
  BookmarkPlus,
  Copy,
  MoreHorizontal,
  Edit3,
  Trash2,
  Bookmark,
  Grid3X3,
  List,
  Search,
  Info
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import ConfirmationDialog from '@/templates/DialogueBox/ConfirmationDialog';

interface Project {
  id: string;
  name: string;
  lastModified: Date;
  description?: string;
  appTemplate: string;
  baseTemplate?: string | null;
}

interface Template {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  usageCount: number;
  baseProject: any;
}

const Projects = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [hoveredProject, setHoveredProject] = useState<string | null>(null);
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(null);
  const [openTemplateMenuId, setOpenTemplateMenuId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('projects');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateName, setEditingTemplateName] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);
  const [templateDeleteDialogOpen, setTemplateDeleteDialogOpen] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [playIntro, setPlayIntro] = useState(false);
  const [introBaseDelay, setIntroBaseDelay] = useState(0);
  const navigate = useNavigate();
  const currentApp = JSON.parse(localStorage.getItem('current-app') || '{}');
  const selectedApp = currentApp.slug;
  const appId = currentApp.id;

  const getAppDetails = () => {
    switch (selectedApp) {
      case 'marketing-mix':
        return {
          title: 'Marketing Mix Modeling',
          description: 'Optimize marketing spend allocation across different channels',
          icon: Target,
          color: 'from-blue-500 to-purple-600',
          lightBg: 'from-blue-50/50 to-purple-50/50',
          accent: 'blue'
        };
      case 'forecasting':
        return {
          title: 'Forecasting Analysis',
          description: 'Predict future trends and patterns with advanced modeling',
          icon: BarChart3,
          color: 'from-green-500 to-teal-600',
          lightBg: 'from-green-50/50 to-teal-50/50',
          accent: 'green'
        };
      case 'promo-effectiveness':
        return {
          title: 'Promo Effectiveness',
          description: 'Measure promotional campaign performance and ROI',
          icon: Zap,
          color: 'from-orange-500 to-red-600',
          lightBg: 'from-orange-50/50 to-red-50/50',
          accent: 'orange'
        };
      case 'blank':
        return {
          title: 'Blank App',
          description: 'Custom analysis workflow from scratch',
          icon: Plus,
          color: 'from-gray-500 to-gray-700',
          lightBg: 'from-gray-50/50 to-gray-100/50',
          accent: 'gray'
        };
      default:
        return {
          title: 'Projects',
          description: 'Manage your analytics projects',
          icon: FolderOpen,
          color: 'from-blue-500 to-purple-600',
          lightBg: 'from-blue-50/50 to-purple-50/50',
          accent: 'blue'
        };
    }
  };

  const appDetails = getAppDetails();
  const Icon = appDetails.icon;

  useEffect(() => {
    if (typeof window === 'undefined') {
      setPlayIntro(true);
      return;
    }

    const stored = sessionStorage.getItem('trinity-login-anim');
    if (stored) {
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
    }

    setIntroBaseDelay(0);
    setPlayIntro(true);
  }, []);

  useEffect(() => {
    const loadProjects = async () => {
      if (!appId) {
        setProjects([]);
        setProjectsLoading(false);
        return;
      }
      setProjectsLoading(true);
      try {
        const res = await fetch(`${REGISTRY_API}/projects/?app=${appId}`, {
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          const parsed = data.map((p: any) => ({
            id: p.id?.toString() || '',
            name: p.name,
            lastModified: new Date(p.updated_at),
            description: p.description,
            appTemplate: selectedApp || 'blank',
            baseTemplate: p.base_template
          }));
          setProjects(parsed);
        }
      } catch (err) {
        console.error('Projects load error', err);
      } finally {
        setProjectsLoading(false);
      }
    };

    loadProjects();

    const loadTemplates = async () => {
      if (!appId) return;
      try {
        const res = await fetch(`${REGISTRY_API}/templates/?app=${appId}`, {
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          const parsed = data.map((t: any) => ({
            id: t.id?.toString() || '',
            name: t.name,
            description: t.description,
            createdAt: new Date(t.created_at),
            usageCount: t.usage_count || 0,
            baseProject: t.base_project
          }));
          setTemplates(parsed);
        }
      } catch (err) {
        console.error('Templates load error', err);
      }
    };

    loadTemplates();
  }, [appId, selectedApp]);

  const createNewProject = async () => {
    if (!appId) return;
    const projectName = `New ${appDetails.title} Project`;
    const slug = `${projectName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    try {
      const res = await fetch(`${REGISTRY_API}/projects/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: projectName,
          slug,
          description: `A new ${appDetails.title.toLowerCase()} analysis project`,
          app: appId,
          state: null
        })
      });
      if (res.ok) {
        const p = await res.json();
        const newProject: Project = {
          id: p.id?.toString() || Date.now().toString(),
          name: p.name,
          lastModified: new Date(p.updated_at || Date.now()),
          description: p.description,
          appTemplate: selectedApp || 'blank',
          baseTemplate: p.base_template || null
        };
        setProjects(prev => [newProject, ...prev]);
        setActiveTab('projects');
      }
    } catch (err) {
      console.error('Create project error', err);
    }
  };

  const openProject = async (project: Project) => {
    clearProjectState();
    saveCurrentProject(project);

    // Construct an initial environment using any existing client identifiers
    // and the currently selected app/project. This ensures env-dependent
    // components (session state, MinIO prefixing, etc.) immediately reflect
    // the user's context even before the backend responds with its
    // canonical environment payload.
    let env: Record<string, string> = {
      APP_NAME: selectedApp || '',
      APP_ID: appId?.toString() || '',
      PROJECT_NAME: project.name,
      PROJECT_ID: project.id?.toString() || '',
    };
    try {
      const envStr = localStorage.getItem('env');
      const baseEnv = envStr ? JSON.parse(envStr) : {};
      if (baseEnv.CLIENT_NAME) env.CLIENT_NAME = baseEnv.CLIENT_NAME;
      if (baseEnv.CLIENT_ID) env.CLIENT_ID = baseEnv.CLIENT_ID;
    } catch {
      /* ignore parse errors */
    }
    localStorage.setItem('env', JSON.stringify(env));

    try {
      const res = await fetch(`${REGISTRY_API}/projects/${project.id}/`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.environment) {
          // Persist the full environment returned by the backend, but ensure
          // current app/project identifiers remain accurate.
          env = {
            ...env,
            ...data.environment,
            APP_NAME: selectedApp || env.APP_NAME,
            APP_ID: appId?.toString() || env.APP_ID,
            PROJECT_NAME: project.name,
            PROJECT_ID: project.id?.toString() || env.PROJECT_ID,
          };
          localStorage.setItem('env', JSON.stringify(env));
        }
      }
    } catch (err) {
      console.log('Project env fetch error', err);
    }
    navigate('/');
  };

  const duplicateProject = async (project: Project) => {
    try {
      const res = await fetch(
        `${REGISTRY_API}/projects/${project.id}/duplicate/`,
        {
          method: 'POST',
          credentials: 'include'
        }
      );
      if (res.ok) {
        const data = await res.json();
        const dup: Project = {
          id: data.id?.toString() || Date.now().toString(),
          name: data.name || `${project.name} Copy`,
          lastModified: new Date(data.updated_at || Date.now()),
          description: data.description,
          appTemplate: project.appTemplate,
          baseTemplate: data.base_template || project.baseTemplate
        };
        setProjects(prev => [dup, ...prev]);
      }
    } catch (err) {
      console.error('Duplicate project error', err);
    }
  };

  const saveProjectAsTemplate = async (project: Project) => {
    try {
      const res = await fetch(`${REGISTRY_API}/projects/${project.id}/save_template/`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        const t = await res.json();
        const template: Template = {
          id: t.id?.toString() || '',
          name: t.name,
          description: t.description,
          createdAt: new Date(t.created_at),
          usageCount: t.usage_count || 0,
          baseProject: t.base_project
        };
        setTemplates([...templates, template]);
      }
    } catch (err) {
      console.error('Save template error', err);
    }
  };

  const importTemplateToProject = async (project: Project, template: Template) => {
    try {
      let proceed = true;
      try {
        const res = await fetch(`${REGISTRY_API}/projects/${project.id}/`, {
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          const state = data.state || {};
          if (state && Object.keys(state).length > 0) {
            proceed = confirm(`Do you want overwrite config for ${project.name}?`);
          }
        }
      } catch (err) {
        console.error('Project state fetch error', err);
      }
      if (!proceed) return;
      const res = await fetch(`${REGISTRY_API}/projects/${project.id}/import_template/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ template_id: template.id, overwrite: true })
      });
      if (res.ok) {
        const updated = await res.json();
        setProjects(
          projects.map(p =>
            p.id === project.id ? { ...p, baseTemplate: updated.base_template } : p
          )
        );
      }
    } catch (err) {
      console.error('Import template error', err);
    }
  };

  const startRename = (project: Project, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingProjectId(project.id);
    setEditingName(project.name);
  };

  const submitRename = async () => {
    if (!editingProjectId) return;
    const original = projects.find(p => p.id === editingProjectId);
    if (!original) {
      setEditingProjectId(null);
      return;
    }
    const newName = editingName.trim();
    if (!newName || newName === original.name) {
      setEditingProjectId(null);
      return;
    }
    try {
      const res = await fetch(`${REGISTRY_API}/projects/${original.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newName })
      });
      if (res.ok) {
        const updated = await res.json();
        setProjects(projects.map(p => (p.id === original.id ? { ...p, name: updated.name } : p)));
      }
    } catch (err) {
      console.error('Rename project error', err);
    }
    setEditingProjectId(null);
  };

  const requestDeleteProject = (project: Project) => {
    setProjectToDelete(project);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    try {
      const res = await fetch(`${REGISTRY_API}/projects/${projectToDelete.id}/`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        setProjects(projects.filter(p => p.id !== projectToDelete.id));
      }
    } catch (err) {
      console.error('Delete project error', err);
    }
    setDeleteDialogOpen(false);
    setProjectToDelete(null);
  };

  const cancelDelete = () => {
    setDeleteDialogOpen(false);
    setProjectToDelete(null);
  };

  const handleProjectDialogOpenChange = (open: boolean) => {
    if (open) {
      setDeleteDialogOpen(true);
    } else {
      cancelDelete();
    }
  };

  const startTemplateRename = (template: Template, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingTemplateId(template.id);
    setEditingTemplateName(template.name);
  };

  const submitTemplateRename = async () => {
    if (!editingTemplateId) return;
    const original = templates.find(t => t.id === editingTemplateId);
    if (!original) {
      setEditingTemplateId(null);
      return;
    }
    const newName = editingTemplateName.trim();
    if (!newName || newName === original.name) {
      setEditingTemplateId(null);
      return;
    }
    try {
      const res = await fetch(`${REGISTRY_API}/templates/${original.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newName })
      });
      if (res.ok) {
        const updated = await res.json();
        setTemplates(templates.map(t => (t.id === original.id ? { ...t, name: updated.name } : t)));
        setProjects(
          projects.map(p =>
            p.baseTemplate === original.name ? { ...p, baseTemplate: updated.name } : p
          )
        );
      }
    } catch (err) {
      console.error('Rename template error', err);
    }
    setEditingTemplateId(null);
  };

  const requestDeleteTemplate = (template: Template) => {
    setTemplateToDelete(template);
    setTemplateDeleteDialogOpen(true);
  };

  const cancelTemplateDelete = () => {
    setTemplateDeleteDialogOpen(false);
    setTemplateToDelete(null);
  };

  const confirmDeleteTemplate = async () => {
    if (!templateToDelete) return;
    try {
      const res = await fetch(`${REGISTRY_API}/templates/${templateToDelete.id}/`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        setTemplates(prev => prev.filter(t => t.id !== templateToDelete.id));
      }
    } catch (err) {
      console.error('Delete template error', err);
    }
    cancelTemplateDelete();
  };

  const handleTemplateDialogOpenChange = (open: boolean) => {
    if (open) {
      setTemplateDeleteDialogOpen(true);
    } else {
      cancelTemplateDelete();
    }
  };

  const createProjectFromTemplate = async (template: Template) => {
    try {
      const res = await fetch(`${REGISTRY_API}/templates/${template.id}/use/`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        const p = await res.json();
        const newProject: Project = {
          id: p.id?.toString() || '',
          name: p.name,
          lastModified: new Date(p.updated_at),
          description: p.description,
          appTemplate: selectedApp || 'blank',
          baseTemplate: p.base_template
        };
        setProjects(prev => [newProject, ...prev]);
        const updatedTemplates = templates.map(t =>
          t.id === template.id ? { ...t, usageCount: t.usageCount + 1 } : t
        );
        setTemplates(updatedTemplates);
      }
    } catch (err) {
      console.error('Use template error', err);
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return `${diff} days ago`;
    return date.toLocaleDateString();
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const animationStyle = (offset: number) => ({
    animationDelay: `${(introBaseDelay + offset).toFixed(1)}s`,
    animationFillMode: 'both' as const,
    ...(playIntro ? { opacity: 0 } : {}),
  });

  return (
    <>
      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={handleProjectDialogOpenChange}
        onConfirm={confirmDeleteProject}
        onCancel={cancelDelete}
        title="Delete project?"
        description={`Deleting project "${projectToDelete?.name || ''}" will delete all saved files, workflows, exhibitions and other details.`}
        icon={<Trash2 className="w-6 h-6 text-white" />}
        iconBgClass="bg-red-500"
        confirmLabel="Yes, delete"
        cancelLabel="Cancel"
        confirmButtonClass="bg-red-500 hover:bg-red-600"
      />
      <ConfirmationDialog
        open={templateDeleteDialogOpen}
        onOpenChange={handleTemplateDialogOpenChange}
        onConfirm={confirmDeleteTemplate}
        onCancel={cancelTemplateDelete}
        title="Delete template?"
        description={`Deleting template "${templateToDelete?.name || ''}" will remove it from your workspace.`}
        icon={<Trash2 className="w-6 h-6 text-white" />}
        iconBgClass="bg-red-500"
        confirmLabel="Yes, delete"
        cancelLabel="Cancel"
        confirmButtonClass="bg-red-500 hover:bg-red-600"
      />
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-white to-gray-50">
        <div
          className="pointer-events-none absolute inset-0 z-0 animate-fade-in"
          style={animationStyle(0)}
        >
          <GreenGlyphRain className="pointer-events-none opacity-90" />
        </div>

        <div className="relative z-10 flex min-h-screen flex-col">
          <div className="animate-slide-in-from-top" style={animationStyle(0.2)}>
            <Header projectCount={projects.length} />
          </div>
          <main className="flex-1">
            <div className="mx-auto max-w-7xl px-6 py-8">
              <div className="mb-8 animate-fade-in" style={animationStyle(0.4)}>
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex-1">
                    <h2 className="mb-2 text-3xl font-bold text-gray-900">Workspace</h2>
                    <p className="text-lg text-gray-600">
                      Manage your {appDetails.title.toLowerCase()} projects and templates
                    </p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
                      <Input
                        placeholder="Search projects & templates..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-10"
                      />
                    </div>
                    <div className="flex items-center rounded-lg border border-gray-200 p-1">
                      <Button
                        variant={viewMode === 'grid' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setViewMode('grid')}
                        className="h-8 w-8 p-0"
                      >
                        <Grid3X3 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={viewMode === 'list' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setViewMode('list')}
                        className="h-8 w-8 p-0"
                      >
                        <List className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      onClick={createNewProject}
                      className="px-6 py-2.5 text-white transition-all duration-300 bg-black shadow-lg hover:bg-gray-900 hover:shadow-xl"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      New Project
                    </Button>
                  </div>
                </div>
              </div>

              <div className="animate-fade-in" style={animationStyle(0.6)}>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
                  <TabsList
                    className="grid w-full max-w-md grid-cols-2 animate-slide-in-from-top mb-6"
                    style={animationStyle(0.7)}
                  >
                    <TabsTrigger value="templates" className="flex items-center space-x-2">
                      <Bookmark className="h-4 w-4" />
                      <span>Templates ({filteredTemplates.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="projects" className="flex items-center space-x-2">
                      <FolderOpen className="h-4 w-4" />
                      <span>Projects ({filteredProjects.length})</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent
                    value="projects"
                    className="mt-0 animate-fade-in"
                    style={animationStyle(0.8)}
                  >
                    <div
                      className={
                        viewMode === 'grid'
                          ? 'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                          : 'space-y-4'
                      }
                    >
              <Card
                className="group cursor-pointer overflow-hidden border-2 border-dashed border-gray-200 bg-gradient-to-br from-white to-gray-50/30 transition-all duration-500 hover:-translate-y-1 hover:border-gray-300 hover:from-white hover:to-gray-50/50 hover:shadow-xl animate-slide-in-from-bottom"
                style={animationStyle(0.9)}
                onClick={createNewProject}
              >
                <div className={viewMode === 'grid' ? 'p-8 flex flex-col items-center justify-center h-56 space-y-6' : 'p-6 flex items-center space-x-6'}>
                  <div className={`${viewMode === 'grid' ? 'w-20 h-20' : 'w-12 h-12'} rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center group-hover:border-gray-400 group-hover:bg-gray-50/50 transition-all duration-500 group-hover:scale-110`}>
                    <Plus className={`${viewMode === 'grid' ? 'w-10 h-10' : 'w-6 h-6'} text-gray-400 group-hover:text-gray-600 transition-colors duration-300`} />
                  </div>
                  <div className={viewMode === 'grid' ? 'text-center' : 'flex-1'}>
                    <h3 className={`${viewMode === 'grid' ? 'text-xl' : 'text-lg'} font-semibold text-gray-900 mb-2 group-hover:text-gray-700 transition-colors`}>Create New Project</h3>
                    <p className="text-sm text-gray-500">Start a new analysis</p>
                  </div>
                </div>
              </Card>

              {filteredProjects.map((project, index) => (
                <Card
                  key={project.id}
                  className="group cursor-pointer overflow-hidden border-0 bg-white transition-all duration-500 hover:-translate-y-1 hover:bg-gradient-to-br hover:from-white hover:to-gray-50/30 hover:shadow-xl animate-slide-in-from-bottom"
                  style={animationStyle(1 + index * 0.08)}
                  onMouseEnter={() => setHoveredProject(project.id)}
                  onMouseLeave={() => {
                    if (openProjectMenuId !== project.id) {
                      setHoveredProject(null);
                    }
                  }}
                  onClick={() => {
                    if (editingProjectId !== project.id) openProject(project);
                  }}
                >
                  <div className={viewMode === 'grid' ? 'p-6 flex flex-col h-56 relative' : 'p-6 flex items-center space-x-6 relative'}>
                    <div className={`absolute ${viewMode === 'grid' ? 'top-0 left-0 w-full h-1' : 'left-0 top-0 w-1 h-full'} bg-gradient-to-r ${appDetails.color} opacity-60`} />
                    <div className={viewMode === 'grid' ? 'flex items-start justify-between mb-6' : 'flex items-center justify-center'}>
                      <div className={`${viewMode === 'grid' ? 'w-14 h-14' : 'w-12 h-12'} rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center group-hover:from-gray-200 group-hover:to-gray-300 transition-all duration-500 shadow-sm`}>
                        <FolderOpen className={`${viewMode === 'grid' ? 'w-7 h-7' : 'w-6 h-6'} text-gray-600 group-hover:text-gray-700 transition-colors`} />
                      </div>
                      {hoveredProject === project.id && (
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateProject(project);
                            }}
                            title="Duplicate"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              requestDeleteProject(project);
                            }}
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                            <DropdownMenu
                              onOpenChange={(open) => {
                                if (open) {
                                  setOpenProjectMenuId(project.id);
                                  setHoveredProject(project.id);
                                } else {
                                  setOpenProjectMenuId(null);
                                  setHoveredProject(null);
                                }
                              }}
                            >
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  setOpenProjectMenuId(project.id);
                                  setHoveredProject(project.id);
                                }}
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => openProject(project)}
                              >
                                <FolderOpen className="w-4 h-4 mr-2" />
                                Open Project
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  saveProjectAsTemplate(project);
                                }}
                              >
                                <BookmarkPlus className="w-4 h-4 mr-2" />
                                Save as Template
                              </DropdownMenuItem>
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger
                                  onClick={(e) => e.stopPropagation()}
                                  onPointerDown={(e) => e.stopPropagation()}
                                >
                                  <Bookmark className="w-4 h-4 mr-2" />
                                  Import from Template
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  {templates.length === 0 ? (
                                    <DropdownMenuItem disabled>None</DropdownMenuItem>
                                  ) : (
                                    templates.map((t) => (
                                      <DropdownMenuItem
                                        key={t.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          importTemplateToProject(project, t);
                                        }}
                                      >
                                        {t.name}
                                      </DropdownMenuItem>
                                    ))
                                  )}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  duplicateProject(project);
                                }}
                              >
                                <Copy className="w-4 h-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => startRename(project, e)}
                              >
                                <Edit3 className="w-4 h-4 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requestDeleteProject(project);
                                }}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                    <div className={viewMode === 'grid' ? 'flex-1' : 'flex-1 ml-4'}>
                      {editingProjectId === project.id ? (
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={submitRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename();
                            if (e.key === 'Escape') setEditingProjectId(null);
                          }}
                          autoFocus
                          className="mb-2"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <h3 className={`${viewMode === 'grid' ? 'text-xl' : 'text-lg'} font-semibold text-gray-900 mb-2 group-hover:text-gray-700 transition-colors duration-300 line-clamp-2`}>{project.name}</h3>
                      )}
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2 leading-relaxed">
                        {`Base Template: ${project.baseTemplate || 'None'}`}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-gray-400 text-xs">
                          <Clock className="w-3 h-3" />
                          <span>{formatDate(project.lastModified)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {projectsLoading && (
              <div className="text-center mt-20">
                <div className="w-20 h-20 rounded-full bg-white/60 backdrop-blur-sm flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Loading your projects</h3>
                <p className="text-gray-500">Preparing your workspace…</p>
              </div>
            )}

            {!projectsLoading && filteredProjects.length === 0 && !searchQuery && (
              <div className="text-center mt-20">
                <div className={`w-32 h-32 rounded-3xl bg-gradient-to-br ${appDetails.lightBg} flex items-center justify-center mx-auto mb-8 shadow-inner`}>
                  <Icon className="w-16 h-16 text-gray-400" />
                </div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">No projects yet</h3>
                <p className="text-gray-500 mb-8 text-lg max-w-md mx-auto leading-relaxed">
                  Create your first {appDetails.title.toLowerCase()} project to start analyzing your data and unlock powerful insights.
                </p>
                <Button
                  onClick={createNewProject}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 px-8 py-4 text-lg"
                >
                  <Plus className="w-5 h-5 mr-3" />
                  Create Your First Project
                </Button>
              </div>
            )}

            {!projectsLoading && filteredProjects.length === 0 && searchQuery && (
              <div className="text-center mt-20">
                <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-6">
                  <Search className="w-12 h-12 text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No projects found</h3>
                <p className="text-gray-500">Try adjusting your search terms</p>
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="templates"
            className="mt-0 animate-fade-in"
            style={animationStyle(0.9)}
          >
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                  : 'space-y-4'
              }
            >
              {filteredTemplates.map((template, index) => (
                <Card
                  key={template.id}
                  className="group cursor-pointer overflow-hidden border-0 bg-white transition-all duration-500 hover:-translate-y-1 hover:bg-gradient-to-br hover:from-white hover:to-gray-50/30 hover:shadow-xl animate-slide-in-from-bottom"
                  style={animationStyle(1.1 + index * 0.08)}
                  onMouseEnter={() => setHoveredTemplate(template.id)}
                  onMouseLeave={() => {
                    if (openTemplateMenuId !== template.id) {
                      setHoveredTemplate(null);
                    }
                  }}
                  onClick={() => {
                    if (editingTemplateId !== template.id) {
                      createProjectFromTemplate(template);
                    }
                  }}
                >
                  <div className={viewMode === 'grid' ? 'p-6 flex flex-col h-56 relative' : 'p-6 flex items-center space-x-6 relative'}>
                    <div className={`absolute ${viewMode === 'grid' ? 'top-0 left-0 w-full h-1' : 'left-0 top-0 w-1 h-full'} bg-gradient-to-r from-amber-400 to-orange-500 opacity-60`} />
                    <div className={viewMode === 'grid' ? 'flex items-start justify-between mb-6' : 'flex items-center justify-center'}>
                      <div className={`${viewMode === 'grid' ? 'w-14 h-14' : 'w-12 h-12'} rounded-xl bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center group-hover:from-amber-100 group-hover:to-orange-200 transition-all duration-500 shadow-sm`}>
                        <Bookmark className={`${viewMode === 'grid' ? 'w-7 h-7' : 'w-6 h-6'} text-amber-600 group-hover:text-orange-600 transition-colors`} />
                      </div>
                      {viewMode === 'grid' && (
                        <div className="flex items-center space-x-2">
                          <Badge variant="secondary" className="text-xs">
                            {template.usageCount} uses
                          </Badge>
                          {hoveredTemplate === template.id && (
                            <div className="flex items-center space-x-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Info className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs max-w-xs">
                                  <p className="font-medium">
                                    {`Based on: ${template.baseProject?.name || 'Unknown'}`}
                                  </p>
                                  {template.description && (
                                    <p>{template.description}</p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      createProjectFromTemplate(template);
                                    }}
                                  >
                                    <Plus className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs w-fit whitespace-nowrap">
                                  Create a Project based on this Template
                                </TooltipContent>
                              </Tooltip>
                              <DropdownMenu
                                onOpenChange={(open) => {
                                  if (open) {
                                    setOpenTemplateMenuId(template.id);
                                    setHoveredTemplate(template.id);
                                  } else {
                                    setOpenTemplateMenuId(null);
                                    setHoveredTemplate(null);
                                  }
                                }}
                              >
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                    }}
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      setOpenTemplateMenuId(template.id);
                                      setHoveredTemplate(template.id);
                                    }}
                                  >
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      createProjectFromTemplate(template);
                                    }}
                                  >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Create Project
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startTemplateRename(template, e);
                                    }}
                                  >
                                    <Edit3 className="w-4 h-4 mr-2" />
                                    Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      requestDeleteTemplate(template);
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className={viewMode === 'grid' ? 'flex-1' : 'flex-1 ml-4'}>
                      {editingTemplateId === template.id ? (
                        <Input
                          value={editingTemplateName}
                          onChange={(e) => setEditingTemplateName(e.target.value)}
                          onBlur={submitTemplateRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitTemplateRename();
                            if (e.key === 'Escape') setEditingTemplateId(null);
                          }}
                          autoFocus
                          className="mb-2"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <h3 className={`${viewMode === 'grid' ? 'text-xl' : 'text-lg'} font-semibold text-gray-900 mb-2 group-hover:text-gray-700 transition-colors duration-300 line-clamp-2`}>{template.name}</h3>
                      )}
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2 leading-relaxed">{template.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{template.usageCount} uses</span>
                        {viewMode === 'list' && hoveredTemplate === template.id && (
                          <div className="flex items-center space-x-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Info className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs max-w-xs">
                                <p className="font-medium">
                                  {`Based on: ${template.baseProject?.name || 'Unknown'}`}
                                </p>
                                {template.description && (
                                  <p>{template.description}</p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    createProjectFromTemplate(template);
                                  }}
                                >
                                  <Plus className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs w-fit whitespace-nowrap">
                                Create a Project based on this Template
                              </TooltipContent>
                            </Tooltip>
                            <DropdownMenu
                              onOpenChange={(open) => {
                                if (open) {
                                  setOpenTemplateMenuId(template.id);
                                  setHoveredTemplate(template.id);
                                } else {
                                  setOpenTemplateMenuId(null);
                                  setHoveredTemplate(null);
                                }
                              }}
                            >
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                  }}
                                  onPointerDown={(e) => {
                                    e.stopPropagation();
                                    setOpenTemplateMenuId(template.id);
                                    setHoveredTemplate(template.id);
                                  }}
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    createProjectFromTemplate(template);
                                  }}
                                >
                                  <Plus className="w-4 h-4 mr-2" />
                                  Create Project
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startTemplateRename(template, e);
                                  }}
                                >
                                  <Edit3 className="w-4 h-4 mr-2" />
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    requestDeleteTemplate(template);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {filteredTemplates.length === 0 && !searchQuery && (
              <div className="text-center mt-20">
                <div className="w-32 h-32 rounded-3xl bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center mx-auto mb-8 shadow-inner">
                  <Bookmark className="w-16 h-16 text-amber-400" />
                </div>
                <h3 className="text-2xl font-semibold text-gray-900 mb-4">No templates yet</h3>
                <p className="text-gray-500 mb-8 text-lg max-w-md mx-auto leading-relaxed">
                  Save your projects as templates to reuse them for future analysis.
                </p>
                <Button onClick={() => setActiveTab('projects')} variant="outline" className="px-8 py-4 text-lg">
                  <FolderOpen className="w-5 h-5 mr-3" />
                  Browse Projects
                </Button>
              </div>
            )}

            {filteredTemplates.length === 0 && searchQuery && (
              <div className="text-center mt-20">
                <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-6">
                  <Search className="w-12 h-12 text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No templates found</h3>
                <p className="text-gray-500">Try adjusting your search terms</p>
              </div>
            )}
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
};

export default Projects;
