import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus,
  FolderOpen,
  ArrowLeft,
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
  Search
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
  appTemplate: string;
  createdAt: Date;
  usageCount: number;
  tags: string[];
  sourceProjectId: string;
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
  const selectedApp = localStorage.getItem('selected-app');

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
    const savedProjects = localStorage.getItem('trinity-projects');
    if (savedProjects) {
      const parsed = JSON.parse(savedProjects).map((p: any) => ({
        ...p,
        lastModified: new Date(p.lastModified)
      }));
      const filtered = parsed.filter((p: Project) => p.appTemplate === selectedApp);
      setProjects(filtered);
    }

    const savedTemplates = localStorage.getItem('trinity-templates');
    if (savedTemplates) {
      const parsed = JSON.parse(savedTemplates).map((t: any) => ({
        ...t,
        createdAt: new Date(t.createdAt)
      }));
      const filteredTemplates = parsed.filter((t: Template) => t.appTemplate === selectedApp);
      setTemplates(filteredTemplates);
    }
  }, [selectedApp]);

  const createNewProject = () => {
    const projectName = `New ${appDetails.title} Project`;
    const newProject: Project = {
      id: Date.now().toString(),
      name: projectName,
      lastModified: new Date(),
      description: `A new ${appDetails.title.toLowerCase()} analysis project`,
      appTemplate: selectedApp || 'blank'
    };
    const updatedProjects = [...projects, newProject];
    setProjects(updatedProjects);
    const allProjects = JSON.parse(localStorage.getItem('trinity-projects') || '[]');
    localStorage.setItem('trinity-projects', JSON.stringify([...allProjects, newProject]));
    localStorage.setItem('current-project', JSON.stringify(newProject));
    navigate('/');
  };

  const openProject = (project: Project) => {
    localStorage.setItem('current-project', JSON.stringify(project));
    navigate('/');
  };

  const duplicateProject = (project: Project) => {
    const dup: Project = {
      ...project,
      id: Date.now().toString(),
      name: `${project.name} Copy`,
      lastModified: new Date()
    };
    const updated = [...projects, dup];
    setProjects(updated);
    const all = JSON.parse(localStorage.getItem('trinity-projects') || '[]');
    localStorage.setItem('trinity-projects', JSON.stringify([...all, dup]));
  };

  const saveProjectAsTemplate = (project: Project) => {
    const template: Template = {
      id: Date.now().toString(),
      name: `${project.name} Template`,
      description: project.description || `Template based on ${project.name}`,
      appTemplate: project.appTemplate,
      createdAt: new Date(),
      usageCount: 0,
      tags: ['custom', appDetails.title.toLowerCase()],
      sourceProjectId: project.id
    };
    const updated = [...templates, template];
    setTemplates(updated);
    const all = JSON.parse(localStorage.getItem('trinity-templates') || '[]');
    localStorage.setItem('trinity-templates', JSON.stringify([...all, template]));
  };

  const createProjectFromTemplate = (template: Template) => {
    const base = projects.find(p => p.id === template.sourceProjectId);
    if (!base) return;
    duplicateProject(base);
    const updatedTemplate = { ...template, usageCount: template.usageCount + 1 };
    const updatedTemplates = templates.map(t => t.id === template.id ? updatedTemplate : t);
    setTemplates(updatedTemplates);
    const all = JSON.parse(localStorage.getItem('trinity-templates') || '[]').map((t: Template) =>
      t.id === template.id ? updatedTemplate : t
    );
    localStorage.setItem('trinity-templates', JSON.stringify(all));
  };

  const goBackToApps = () => {
    localStorage.removeItem('selected-app');
    navigate('/apps');
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
    t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-gray-50">
      <div className="bg-white/80 backdrop-blur-sm shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <Button
                variant="ghost"
                onClick={goBackToApps}
                className="text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all duration-200"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Apps
              </Button>
              <div className="flex items-center space-x-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${appDetails.color} flex items-center justify-center shadow-lg shadow-gray-200/50 ring-1 ring-white/20`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900 mb-1">{appDetails.title}</h1>
                  <p className="text-sm text-gray-600">{appDetails.description}</p>
                </div>
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-6 text-sm text-gray-500">
              <div className="flex items-center space-x-2">
                <FolderOpen className="w-4 h-4" />
                <span>{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

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
                className="bg-yellow-500 hover:bg-yellow-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 px-6 py-2.5"
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
                              <DropdownMenuItem onClick={() => openProject(project)}>
                                <FolderOpen className="w-4 h-4 mr-2" />
                                Open Project
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
                  onClick={() => createProjectFromTemplate(template)}
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
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => createProjectFromTemplate(template)}>
                                  <Plus className="w-4 h-4 mr-2" />
                                  Create Project
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Edit3 className="w-4 h-4 mr-2" />
                                  Edit Template
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Copy className="w-4 h-4 mr-2" />
                                  Duplicate
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      )}
                    </div>
                    <div className={viewMode === 'grid' ? 'flex-1' : 'flex-1 ml-4'}>
                      <h3 className={`${viewMode === 'grid' ? 'text-xl' : 'text-lg'} font-semibold text-gray-900 mb-2 group-hover:text-gray-700 transition-colors duration-300 line-clamp-2`}>{template.name}</h3>
                      <p className="text-sm text-gray-600 mb-4 line-clamp-2 leading-relaxed">{template.description}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-wrap gap-1 mb-2">
                          {template.tags.slice(0,2).map((tag, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{tag}</Badge>
                          ))}
                          {template.tags.length > 2 && (
                            <Badge variant="outline" className="text-xs">+{template.tags.length - 2}</Badge>
                          )}
                        </div>
                        {viewMode === 'list' && hoveredTemplate === template.id && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => createProjectFromTemplate(template)}>
                                <Plus className="w-4 h-4 mr-2" />
                                Create Project
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Edit3 className="w-4 h-4 mr-2" />
                                Edit Template
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Copy className="w-4 h-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
