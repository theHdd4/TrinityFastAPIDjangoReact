import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Header from '@/components/Header';
import { REGISTRY_API } from '@/lib/api';
import {
  Plus,
  FolderOpen,
  Target,
  BarChart3,
  Zap,
  Clock,
  BookmarkPlus,
  Copy,
  MoreHorizontal,
  Edit3,
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
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

interface Project {
  id: string;
  name: string;
  lastModified: Date;
  description?: string;
  appTemplate: string;
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
  const [activeTab, setActiveTab] = useState('projects');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
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
    const loadProjects = async () => {
      if (!appId) return;
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
            appTemplate: selectedApp || 'blank'
          }));
          setProjects(parsed);
        }
      } catch (err) {
        console.error('Projects load error', err);
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
          app: appId
        })
      });
      if (res.ok) {
        const p = await res.json();
        const newProject: Project = {
          id: p.id?.toString() || Date.now().toString(),
          name: p.name,
          lastModified: new Date(p.updated_at || Date.now()),
          description: p.description,
          appTemplate: selectedApp || 'blank'
        };
        setProjects([...projects, newProject]);
        localStorage.setItem('current-project', JSON.stringify(newProject));
        navigate('/');
      }
    } catch (err) {
      console.error('Create project error', err);
    }
  };

  const openProject = (project: Project) => {
    localStorage.setItem('current-project', JSON.stringify(project));
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
          appTemplate: project.appTemplate
        };
        setProjects([...projects, dup]);
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
          appTemplate: selectedApp || 'blank'
        };
        setProjects([...projects, newProject]);
        const updatedTemplates = templates.map(t =>
          t.id === template.id ? { ...t, usageCount: t.usageCount + 1 } : t
        );
        setTemplates(updatedTemplates);
        localStorage.setItem('current-project', JSON.stringify(newProject));
        navigate('/');
      }
    } catch (err) {
      console.error('Use template error', err);
    }
  };

  const showTemplateDetails = (template: Template) => {
    alert(`Template based on: ${template.baseProject?.name || 'Unknown'}\nDescription: ${template.description || ''}`);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-gray-50">
      <Header projectCount={projects.length} />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex-1">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Workspace</h2>
              <p className="text-gray-600 text-lg">Manage your {appDetails.title.toLowerCase()} projects and templates</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search projects & templates..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <div className="flex items-center border border-gray-200 rounded-lg p-1">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="h-8 w-8 p-0"
                >
                  <Grid3X3 className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="h-8 w-8 p-0"
                >
                  <List className="w-4 h-4" />
                </Button>
              </div>
              <Button
                onClick={createNewProject}
                className="bg-black hover:bg-gray-900 text-white shadow-lg hover:shadow-xl transition-all duration-300 px-6 py-2.5"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Project
              </Button>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
            <TabsTrigger value="templates" className="flex items-center space-x-2">
              <Bookmark className="w-4 h-4" />
              <span>Templates ({filteredTemplates.length})</span>
            </TabsTrigger>
            <TabsTrigger value="projects" className="flex items-center space-x-2">
              <FolderOpen className="w-4 h-4" />
              <span>Projects ({filteredProjects.length})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="projects" className="mt-0">
            <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6' : 'space-y-4'}>
              <Card
                className="group cursor-pointer hover:shadow-xl transition-all duration-500 border-2 border-dashed border-gray-200 hover:border-gray-300 bg-gradient-to-br from-white to-gray-50/30 hover:from-white hover:to-gray-50/50 transform hover:-translate-y-1"
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

              {filteredProjects.map(project => (
                <Card
                  key={project.id}
                  className="group cursor-pointer hover:shadow-xl transition-all duration-500 border-0 bg-white hover:bg-gradient-to-br hover:from-white hover:to-gray-50/30 overflow-hidden transform hover:-translate-y-1"
                  onMouseEnter={() => setHoveredProject(project.id)}
                  onMouseLeave={() => setHoveredProject(null)}
                  onClick={() => openProject(project)}
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
                            className="h-8 w-8 p-0 hover:bg-blue-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              saveProjectAsTemplate(project);
                            }}
                            title="Save as Template"
                          >
                            <BookmarkPlus className="w-4 h-4 text-blue-600" />
                          </Button>
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
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
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
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  duplicateProject(project);
                                }}
                              >
                                <Copy className="w-4 h-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Edit3 className="w-4 h-4 mr-2" />
                                Rename
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                    <div className={viewMode === 'grid' ? 'flex-1' : 'flex-1 ml-4'}>
                      <h3 className={`${viewMode === 'grid' ? 'text-xl' : 'text-lg'} font-semibold text-gray-900 mb-2 group-hover:text-gray-700 transition-colors duration-300 line-clamp-2`}>{project.name}</h3>
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2 leading-relaxed">{project.description}</p>
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

            {filteredProjects.length === 0 && !searchQuery && (
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

            {filteredProjects.length === 0 && searchQuery && (
              <div className="text-center mt-20">
                <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-6">
                  <Search className="w-12 h-12 text-gray-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No projects found</h3>
                <p className="text-gray-500">Try adjusting your search terms</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="templates" className="mt-0">
            <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6' : 'space-y-4'}>
              {filteredTemplates.map(template => (
                <Card
                  key={template.id}
                  className="group cursor-pointer hover:shadow-xl transition-all duration-500 border-0 bg-white hover:bg-gradient-to-br hover:from-white hover:to-gray-50/30 overflow-hidden transform hover:-translate-y-1"
                  onMouseEnter={() => setHoveredTemplate(template.id)}
                  onMouseLeave={() => setHoveredTemplate(null)}
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
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e)=>{e.stopPropagation(); showTemplateDetails(template);}}>
                                <Info className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e)=>{e.stopPropagation(); createProjectFromTemplate(template);}}>
                                <Plus className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className={viewMode === 'grid' ? 'flex-1' : 'flex-1 ml-4'} onClick={() => createProjectFromTemplate(template)}>
                      <h3 className={`${viewMode === 'grid' ? 'text-xl' : 'text-lg'} font-semibold text-gray-900 mb-2 group-hover:text-gray-700 transition-colors duration-300 line-clamp-2`}>{template.name}</h3>
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2 leading-relaxed">{template.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{template.usageCount} uses</span>
                        {viewMode === 'list' && hoveredTemplate === template.id && (
                          <div className="flex items-center space-x-1">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e)=>{e.stopPropagation(); showTemplateDetails(template);}}>
                              <Info className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e)=>{e.stopPropagation(); createProjectFromTemplate(template);}}>
                              <Plus className="w-4 h-4" />
                            </Button>
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
  );
};

export default Projects;
