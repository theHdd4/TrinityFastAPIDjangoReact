import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sparkles, ArrowRight, Plus, LucideIcon, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import { REGISTRY_API } from '@/lib/api';
import { clearProjectState, saveCurrentProject } from '@/utils/projectStorage';
import { startProjectTransition } from '@/utils/projectTransition';

interface App {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  custom: boolean;
}

interface Template {
  id: string;
  name: string;
  description?: string;
}

interface CreateNewProjectProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apps?: App[];
  appMap?: Record<string, number>;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  appTemplate: string;
  baseTemplate?: string | null;
}

const CreateNewProject: React.FC<CreateNewProjectProps> = ({ open, onOpenChange, apps = [], appMap = {} }) => {
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState('');
  const [selectedApp, setSelectedApp] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [validationError, setValidationError] = useState<string>('');

  // Custom collapse state for the two groups
  const [collapsedCustom, setCollapsedCustom] = useState(false);
  const [collapsedAll, setCollapsedAll] = useState(false);

  // Search-in-trigger state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Separate apps into custom and all applications
  const customApps = apps.filter(app => app.custom);
  const allApps = apps.filter(app => !app.custom);

  const handleSave = () => {
    console.log('Project name saved:', projectName);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
      e.currentTarget.blur();
    }
  };

  const handleBlur = () => {
    if (projectName.trim()) {
      handleSave();
    }
  };

  // Load templates for selected app
  const loadTemplates = async (appSlug: string) => {
    if (!appSlug || !appMap[appSlug]) {
      setTemplates([]);
      return;
    }

    const backendAppId = appMap[appSlug];
    setTemplatesLoading(true);
    try {
      const res = await fetch(`${REGISTRY_API}/templates/?app=${backendAppId}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        const parsed = data.map((t: any) => ({
          id: t.id?.toString() || '',
          name: t.name,
          description: t.description,
        }));
        setTemplates(parsed);
      } else {
        setTemplates([]);
      }
    } catch (err) {
      console.error('Templates load error', err);
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const handleAppChange = (value: string) => {
    setSelectedApp(value);
    setSelectedTemplate(''); // Reset template selection when app changes
    setSearchQuery(''); // Clear search query when app is selected
    loadTemplates(value);
  };

  const handleTemplateChange = (value: string) => {
    setSelectedTemplate(value);
    console.log('Selected template:', value);
  };

  // Filter apps based on search query
  const filterApps = (appsList: App[], query: string): App[] => {
    if (!query.trim()) return appsList;
    const lowerQuery = query.toLowerCase();
    return appsList.filter(app => app.title.toLowerCase().includes(lowerQuery));
  };

  const filteredCustomApps = filterApps(customApps, searchQuery);
  const filteredAllApps = filterApps(allApps, searchQuery);
  const allFilteredApps = [...filteredCustomApps, ...filteredAllApps];

  // Auto-focus search input when Select opens
  useEffect(() => {
    if (isSelectOpen && inputRef.current) {
      // Small delay to ensure SelectContent is rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [isSelectOpen]);

  // Navigate to laboratory mode after project creation
  const navigateToLaboratory = async (project: Project) => {
    clearProjectState();
    saveCurrentProject(project);

    // Construct an initial environment using any existing client identifiers
    // and the currently selected app/project.
    let env: Record<string, string> = {
      APP_NAME: selectedApp || '',
      APP_ID: appMap[selectedApp]?.toString() || '',
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
            APP_ID: appMap[selectedApp]?.toString() || env.APP_ID,
            PROJECT_NAME: project.name,
            PROJECT_ID: project.id?.toString() || env.PROJECT_ID,
          };
          localStorage.setItem('env', JSON.stringify(env));
        }
      }
    } catch (err) {
      console.log('Project env fetch error', err);
    }

    startProjectTransition(navigate);
    onOpenChange(false);
  };

  // Create project function
  const handleCreateProject = async () => {
    // Validate project name
    if (!projectName.trim()) {
      setValidationError('Project name is required');
      return;
    }

    // Validate app selection
    if (!selectedApp || !appMap[selectedApp]) {
      setValidationError('Please select an application');
      return;
    }

    setValidationError('');
    setIsCreating(true);

    try {
      const backendAppId = appMap[selectedApp];
      let project: Project;

      if (selectedTemplate) {
        // Create project from template
        const res = await fetch(`${REGISTRY_API}/templates/${selectedTemplate}/use/`, {
          method: 'POST',
          credentials: 'include',
        });

        if (!res.ok) {
          throw new Error('Failed to create project from template');
        }

        const p = await res.json();
        const projectId = p.id?.toString() || '';
        
        // Update project name to use the user-provided name
        if (projectName.trim() && projectId) {
          const updateRes = await fetch(`${REGISTRY_API}/projects/${projectId}/`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              name: projectName.trim(),
            }),
          });

          if (updateRes.ok) {
            const updated = await updateRes.json();
            project = {
              id: projectId,
              name: updated.name,
              description: updated.description || p.description,
              appTemplate: selectedApp || 'blank',
              baseTemplate: updated.base_template || p.base_template || null,
            };
          } else {
            // If update fails, use the original project data
            project = {
              id: projectId,
              name: p.name,
              description: p.description,
              appTemplate: selectedApp || 'blank',
              baseTemplate: p.base_template || null,
            };
          }
        } else {
          project = {
            id: projectId,
            name: p.name,
            description: p.description,
            appTemplate: selectedApp || 'blank',
            baseTemplate: p.base_template || null,
          };
        }
      } else {
        // Create project without template
        const slug = `${projectName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
        const res = await fetch(`${REGISTRY_API}/projects/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: projectName.trim(),
            slug,
            description: `A new project`,
            app: backendAppId,
            state: null,
          }),
        });

        if (!res.ok) {
          throw new Error('Failed to create project');
        }

        const p = await res.json();
        project = {
          id: p.id?.toString() || Date.now().toString(),
          name: p.name,
          description: p.description,
          appTemplate: selectedApp || 'blank',
          baseTemplate: p.base_template || null,
        };
      }

      // Navigate to laboratory mode
      await navigateToLaboratory(project);
    } catch (err) {
      console.error('Create project error', err);
      setValidationError(err instanceof Error ? err.message : 'Failed to create project. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setProjectName('');
      setSelectedApp('');
      setSelectedTemplate('');
      setTemplates([]);
      setTemplatesLoading(false);
      setIsCreating(false);
      setValidationError('');
      setSearchQuery('');
      setIsSelectOpen(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#FFBD59]" />
            <DialogTitle className="text-lg font-semibold text-gray-800">
              Create New Project
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-gray-500 pt-1">
            Select a template or create a custom app
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="project-name" className="text-sm font-medium text-gray-800">
              Project Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="project-name"
              type="text"
              placeholder="Marketing Mix Modeling"
              value={projectName}
              onChange={(e) => {
                setProjectName(e.target.value);
                if (validationError) setValidationError('');
              }}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              className="w-full"
            />
            {validationError && (
              <p className="text-sm text-red-500 mt-1">{validationError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="application-type" className="text-sm font-medium text-gray-800">
              Application Type <span className="text-red-500">*</span>
            </Label>

            <Select 
              value={selectedApp} 
              onValueChange={handleAppChange}
              open={isSelectOpen}
              onOpenChange={setIsSelectOpen}
            >
              <SelectTrigger id="application-type" className="w-full">
                {isSelectOpen ? (
                  // Search input when Select is open
                  <div className="flex items-center gap-2 w-full px-2 py-1">
                    <input
                      ref={inputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        // Prevent Select from closing or handling keyboard shortcuts
                        e.stopPropagation();
                        // Prevent arrow keys from navigating Select items while typing
                        if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
                          e.preventDefault();
                        }
                        // Enter key: select first filtered result if available
                        if (e.key === 'Enter' && allFilteredApps.length > 0 && !e.defaultPrevented) {
                          e.preventDefault();
                          handleAppChange(allFilteredApps[0].id);
                          setIsSelectOpen(false);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Search applications..."
                      className="w-full px-2 py-1 text-sm bg-transparent outline-none flex-1"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSearchQuery('');
                          inputRef.current?.focus();
                        }}
                        className="flex-shrink-0 text-gray-400 hover:text-gray-600 focus:outline-none"
                        aria-label="Clear search"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  // Selected value or placeholder when Select is closed
                  <SelectValue placeholder="Select an application">
                    {selectedApp && (() => {
                      const selected = apps.find(app => app.id === selectedApp);
                      return selected ? selected.title : '';
                    })()}
                  </SelectValue>
                )}
              </SelectTrigger>

              {/* ---------- Custom SelectContent with collapsible groups or filtered results ---------- */}
              <SelectContent className="z-[12020] max-h-72 overflow-auto">
                {searchQuery.trim() ? (
                  // Filtered flat list when searching
                  <>
                    {allFilteredApps.length > 0 ? (
                      <div className="py-1">
                        {allFilteredApps.map((app) => {
                          const Icon = app.icon;
                          return (
                            <SelectItemKeyWrapped app={app} Icon={Icon} key={app.id} />
                          );
                        })}
                      </div>
                    ) : (
                      <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                        No applications found
                      </div>
                    )}
                  </>
                ) : (
                  // Original collapsible groups when not searching
                  <>
                    {/* CUSTOM APPS GROUP HEADER */}
                    {customApps.length > 0 && (
                      <div className="px-2 py-1">
                        <button
                          type="button"
                          aria-expanded={!collapsedCustom}
                          onClick={() => setCollapsedCustom(prev => !prev)}
                          className="w-full flex items-center justify-between px-2 py-2 rounded hover:bg-slate-50 focus:outline-none"
                        >
                          <div className="flex items-center gap-2">
                            <Plus className="w-4 h-4" />
                            <span className="text-sm font-medium">Custom Applications</span>
                          </div>
                          <span className="flex items-center">
                            {collapsedCustom ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                          </span>
                        </button>

                        {/* Animated/conditional list - use simple conditional rendering + tailwind for max-h transition */}
                        {!collapsedCustom && (
                          <div className="mt-1 space-y-0">
                            {customApps.map((app) => {
                              const Icon = app.icon;
                              return (
                                <SelectItemKeyWrapped app={app} Icon={Icon} key={app.id} />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ALL APPS GROUP HEADER */}
                    {allApps.length > 0 && (
                      <div className="px-2 py-1">
                        <button
                          type="button"
                          aria-expanded={!collapsedAll}
                          onClick={() => setCollapsedAll(prev => !prev)}
                          className="w-full flex items-center justify-between px-2 py-2 rounded hover:bg-slate-50 focus:outline-none"
                        >
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4" />
                            <span className="text-sm font-medium">All Applications</span>
                          </div>
                          <span className="flex items-center">
                            {collapsedAll ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                          </span>
                        </button>

                        {!collapsedAll && (
                          <div className="mt-1 space-y-0">
                            {allApps.map((app) => {
                              const Icon = app.icon;
                              return (
                                <SelectItemKeyWrapped app={app} Icon={Icon} key={app.id} />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-select" className="text-sm font-medium text-gray-800">
              Template
            </Label>

            <Select 
              value={selectedTemplate} 
              onValueChange={handleTemplateChange}
              disabled={!selectedApp || templatesLoading || templates.length === 0}
            >
              <SelectTrigger 
                id="template-select" 
                className="w-full"
                disabled={!selectedApp || templatesLoading || templates.length === 0}
              >
                <SelectValue placeholder={
                  !selectedApp 
                    ? "Select an application first" 
                    : templatesLoading 
                    ? "Loading templates..." 
                    : templates.length === 0 
                    ? "No templates available" 
                    : "Select a template"
                }>
                  {selectedTemplate && (() => {
                    const selected = templates.find(t => t.id === selectedTemplate);
                    return selected ? selected.name : '';
                  })()}
                </SelectValue>
              </SelectTrigger>

              <SelectContent className="z-[12020]">
                {templates.length > 0 ? (
                  templates.map((template) => {
                    return (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    );
                  })
                ) : (
                  <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                    No templates available
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex-row justify-end gap-2 sm:gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateProject}
            disabled={isCreating}
            className="bg-[#FFBD59] hover:bg-[#FFA726] text-gray-600 font-medium shadow-md hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                Create Project
                <ArrowRight className="w-4 h-4 ml-1 text-gray-700" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* Small helper component so the SelectItem stays correct and re-usable.
   We use SelectItem but render our own inner flex container with min-w-0 to
   ensure truncate works correctly. */
const SelectItemKeyWrapped: React.FC<{ app: App; Icon: LucideIcon }> = ({ app, Icon }) => {
  return (
    <SelectItem key={app.id} value={app.id} className="rounded-sm">
      <div className="flex items-center gap-2 min-w-0 px-2 py-2">
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="truncate min-w-0">{app.title}</span>
      </div>
    </SelectItem>
  );
};

export default CreateNewProject;
