import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Plus, FolderOpen, Calendar, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/Header';
import { REGISTRY_API } from '@/lib/api';
import { safeStringify } from '@/utils/safeStringify';
import { molecules } from '@/components/MoleculeList/data/molecules';

interface Project {
  id: number;
  name: string;
  slug: string;
  description: string;
  app: number;
  state?: Record<string, unknown> | null;
  updated_at: string;
  lastModified?: Date;
}

// Default molecules to preload for each app template
const templates: Record<string, string[]> = {
  'marketing-mix': ['data-pre-process', 'build'],
  forecasting: ['data-pre-process', 'explore'],
  'promo-effectiveness': ['explore', 'build'],
  blank: []
};

const Projects = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentApp, setCurrentApp] = useState<{ id: number; slug: string } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const loadProjects = React.useCallback(async () => {
    if (!currentApp) return;
    try {
      const res = await fetch(`${REGISTRY_API}/projects/?app=${currentApp.id}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const parsed = data.map((p: Project) => ({
          ...p,
          lastModified: new Date(p.updated_at)
        }));
        setProjects(parsed);
      }
    } catch {
      /* ignore */
    }
  }, [currentApp]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const slug = params.get('app');
    const stored = localStorage.getItem('current-app');
    if (stored) {
      try {
        const obj = JSON.parse(stored);
        if (!slug || slug === obj.slug) {
          setCurrentApp(obj);
          return;
        }
      } catch {
        /* ignore */
      }
    }

    if (slug) {
      // fetch mapping to id
      (async () => {
        try {
          const res = await fetch(`${REGISTRY_API}/apps/`, { credentials: 'include' });
          if (res.ok) {
            const apps: { id: number; slug: string }[] = await res.json();
            const match = apps.find(a => a.slug === slug);
            if (match) {
              const obj = { id: match.id, slug: match.slug };
              localStorage.setItem('current-app', JSON.stringify(obj));
              setCurrentApp(obj);
            }
          }
        } catch {
          /* ignore */
        }
      })();
    }
  }, [location.search]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const createNewProject = async () => {
    if (!currentApp) return;

    const name = `${currentApp.slug} project`;
    const slug = `${currentApp.slug}-${Date.now()}`;

    try {
      const res = await fetch(`${REGISTRY_API}/projects/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          slug,
          description: `New ${currentApp.slug} project`,
          app: currentApp.id,
        }),
      });
      if (res.ok) {
        const project = await res.json();
        localStorage.setItem('current-project', JSON.stringify(project));

        const ids = templates[currentApp.slug] || [];
        let layout: any[] = [];
        if (ids.length > 0) {
          const timestamp = Date.now();
          layout = ids
            .map((id, index) => {
              const info = molecules.find(m => m.id === id);
              if (!info) return null;
              const selectedAtoms: Record<string, boolean> = {};
              info.atoms.forEach((atom, aIdx) => {
                selectedAtoms[atom] = aIdx < 2;
              });
              return {
                id: `${id}-${timestamp}-${index}`,
                type: info.type,
                title: info.title,
                subtitle: info.subtitle,
                tag: info.tag,
                atoms: info.atoms,
                position: { x: 100 + index * 250, y: 100 },
                connections: [],
                selectedAtoms,
                atomOrder: [...info.atoms]
              };
            })
            .filter(Boolean) as any[];

          for (let i = 0; i < layout.length - 1; i++) {
            layout[i].connections.push({ target: layout[i + 1].id });
          }

          localStorage.setItem('workflow-canvas-molecules', safeStringify(layout));
        } else {
          localStorage.removeItem('workflow-canvas-molecules');
        }

        try {
          await fetch(`${REGISTRY_API}/projects/${project.id}/`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ state: { workflow_canvas: layout } })
          });
        } catch {
          /* ignore */
        }

        navigate('/workflow');
      }
    } catch {
      /* ignore */
    }
  };

  const openProject = async (project: Project) => {
    localStorage.setItem('current-project', JSON.stringify(project));
    try {
      const res = await fetch(`${REGISTRY_API}/projects/${project.id}/`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.state && data.state.workflow_canvas) {
          localStorage.setItem(
            'workflow-canvas-molecules',
            safeStringify(data.state.workflow_canvas)
          );
        } else {
          localStorage.removeItem('workflow-canvas-molecules');
        }
        if (data.state && data.state.workflow_selected_atoms) {
          localStorage.setItem(
            'workflow-selected-atoms',
            safeStringify(data.state.workflow_selected_atoms)
          );
        }
        if (data.state && data.state.laboratory_config) {
          localStorage.setItem(
            'laboratory-config',
            safeStringify(data.state.laboratory_config)
          );
          if (data.state.laboratory_config.cards) {
            localStorage.setItem(
              'laboratory-layout-cards',
              safeStringify(data.state.laboratory_config.cards)
            );
          }
        }
      }
    } catch {
      /* ignore */
    }
    navigate('/workflow');
  };

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const startRename = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setEditingId(project.id);
    setEditingName(project.name);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const saveRename = async () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    try {
      await fetch(`${REGISTRY_API}/projects/${editingId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: trimmed, slug: trimmed.toLowerCase().replace(/\s+/g, '-') }),
      });
      await loadProjects();
    } catch {
      /* ignore */
    }
    setEditingId(null);
  };

  const deleteProject = async (id: number) => {
    try {
      await fetch(`${REGISTRY_API}/projects/${id}/`, { method: 'DELETE', credentials: 'include' });
      await loadProjects();
    } catch {
      /* ignore */
    }
    setDeleteId(null);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">

      <Header />

      <div className="relative z-10 p-8">
        <Button
          variant="ghost"
          onClick={() => navigate('/apps')}
          className="text-black hover:bg-trinity-yellow/10"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Apps
        </Button>
        <h1 className="text-3xl font-light text-black">
          Trinity Projects{currentApp ? ` - ${currentApp.slug}` : ''}
        </h1>
        <p className="text-black/60 text-sm">Access your quantum matrices</p>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex-1 px-8 pb-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {/* Create New Project Card */}
            <Card
              className="bg-trinity-bg-secondary border-gray-300 hover:border-trinity-yellow transition-all duration-300 cursor-pointer hover:shadow"
              onClick={createNewProject}
            >
              <div className="p-6 flex flex-col items-center justify-center h-48 space-y-4">
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-trinity-yellow/40 flex items-center justify-center group-hover:border-trinity-yellow group-hover:bg-trinity-yellow/5 transition-all duration-300">
                  <Plus className="w-8 h-8 text-trinity-yellow/60 group-hover:text-trinity-yellow transition-colors duration-300" />
                </div>
                <div className="text-center">
                  <h3 className="text-black font-medium">Create New Project</h3>
                  <p className="text-black/50 text-sm mt-1">Initialize new matrix</p>
                </div>
              </div>
            </Card>

            {/* Existing Projects */}
            {projects.map((project) => (
              <Card
                key={project.id}
                className="bg-trinity-bg-secondary border-gray-300 hover:border-trinity-yellow transition-all duration-300 cursor-pointer hover:shadow"
                onClick={() => openProject(project)}
              >
                <div className="p-6 flex flex-col h-48">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-10 h-10 rounded-lg bg-trinity-yellow/10 flex items-center justify-center group-hover:bg-trinity-yellow/20 transition-colors duration-300">
                        <FolderOpen className="w-5 h-5 text-trinity-yellow" />
                      </div>
                      <button
                        type="button"
                        onClick={(e) => startRename(e, project)}
                        className="text-black/50 hover:text-black"
                        title="Rename project"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <AlertDialog
                        open={deleteId === project.id}
                        onOpenChange={(open) => {
                          if (!open) setDeleteId(null);
                        }}
                      >
                        <AlertDialogTrigger asChild>
                          <button
                            type="button"
                            className="p-1 text-red-500 hover:text-red-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteId(project.id);
                            }}
                            title="Delete project"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete project?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteProject(project.id);
                              }}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-trinity-green rounded-full animate-pulse opacity-60"></div>
                    </div>
                  </div>
                  
                  <div className="flex-1">
                    {editingId === project.id ? (
                      <input
                        ref={inputRef}
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={saveRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            saveRename();
                          }
                        }}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-black"
                      />
                    ) : (
                      <h3 className="text-black font-medium mb-2 group-hover:text-black/80 transition-colors duration-300">
                        {project.name}
                      </h3>
                    )}
                    <p className="text-black/50 text-xs mb-4 line-clamp-2">
                      {project.description}
                    </p>
                  </div>

                  <div className="flex items-center space-x-2 text-black/40 text-xs">
                    <Calendar className="w-3 h-3" />
                    <span>{project.lastModified.toLocaleDateString()}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Footer Message */}
          <div className="text-center mt-16">
            <p className="text-black/50 text-sm">
              "The Matrix has you..." - Begin your first project
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Projects;
