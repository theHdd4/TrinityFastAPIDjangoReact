import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Plus,
  FolderOpen,
  Calendar,
  Pencil,
  Trash,
  Target,
  BarChart3,
  Zap
} from 'lucide-react';
import Header from '@/components/Header';
import { REGISTRY_API } from '@/lib/api';
import { molecules } from '@/components/MoleculeList/data/molecules';
import { safeStringify } from '@/utils/safeStringify';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { useExhibitionStore } from '@/components/ExhibitionMode/store/exhibitionStore';

interface Project {
  id: number;
  name: string;
  slug: string;
  description: string;
  app: number;
  updated_at: string;
  state?: Record<string, unknown> | null;
  lastModified?: Date;
}

const templates: Record<string, string[]> = {
  'marketing-mix': ['data-pre-process', 'build'],
  forecasting: ['data-pre-process', 'explore'],
  'promo-effectiveness': ['explore', 'build'],
  blank: []
};

const Projects = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [appId, setAppId] = useState<number | null>(null);
  const [appSlug, setAppSlug] = useState<string>('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const resetLaboratory = useLaboratoryStore(state => state.reset);
  const resetExhibition = useExhibitionStore(state => state.reset);

  const getAppDetails = () => {
    switch (appSlug) {
      case 'marketing-mix':
        return {
          title: 'Marketing Mix Modeling',
          description: 'Optimize marketing spend allocation across different channels',
          icon: Target,
          color: 'from-blue-500 to-purple-600'
        };
      case 'forecasting':
        return {
          title: 'Forecasting Analysis',
          description: 'Predict future trends and patterns with advanced modeling',
          icon: BarChart3,
          color: 'from-green-500 to-teal-600'
        };
      case 'promo-effectiveness':
        return {
          title: 'Promo Effectiveness',
          description: 'Measure promotional campaign performance and ROI',
          icon: Zap,
          color: 'from-orange-500 to-red-600'
        };
      case 'blank':
        return {
          title: 'Blank App',
          description: 'Custom analysis workflow from scratch',
          icon: Plus,
          color: 'from-gray-500 to-gray-700'
        };
      default:
        return {
          title: 'Projects',
          description: 'Manage your analytics projects',
          icon: FolderOpen,
          color: 'from-blue-500 to-purple-600'
        };
    }
  };

  const appDetails = getAppDetails();
  const Icon = appDetails.icon;

  const loadProjects = useCallback(async () => {
    if (!appId) return;
    try {
      const res = await fetch(`${REGISTRY_API}/projects/?app=${appId}`, {
        credentials: 'include'
      });
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
  }, [appId]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const slug = params.get('app');
    const stored = localStorage.getItem('current-app');
    if (stored) {
      try {
        const obj = JSON.parse(stored);
        if (!slug || slug === obj.slug) {
          setAppId(obj.id);
          setAppSlug(obj.slug);
          return;
        }
      } catch {
        /* ignore */
      }
    }

    if (slug) {
      (async () => {
        try {
          const res = await fetch(`${REGISTRY_API}/apps/`, { credentials: 'include' });
          if (res.ok) {
            const apps: { id: number; slug: string }[] = await res.json();
            const match = apps.find(a => a.slug === slug);
            if (match) {
              localStorage.setItem('current-app', JSON.stringify({ id: match.id, slug: match.slug }));
              setAppId(match.id);
              setAppSlug(match.slug);
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
    if (!appId || !appSlug) return;
    const name = `${appSlug} project`;
    const slug = `${appSlug}-${Date.now()}`;

    try {
      const res = await fetch(`${REGISTRY_API}/projects/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, slug, description: `New ${appSlug} project`, app: appId })
      });
      if (res.ok) {
        const project = await res.json();
        localStorage.setItem('current-project', JSON.stringify(project));

        const ids = templates[appSlug] || [];
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
        // ensure previous selections don't bleed into a new project
        localStorage.removeItem('workflow-selected-atoms');
        localStorage.removeItem('laboratory-config');
        localStorage.removeItem('laboratory-layout-cards');
        resetLaboratory();
        resetExhibition();

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

  const startRename = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditId(project.id);
    setEditName(project.name);
  };

  const submitRename = async () => {
    if (!editId) return;
    try {
      const res = await fetch(`${REGISTRY_API}/projects/${editId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: editName })
      });
      if (res.ok) {
        const updated = await res.json();
        setProjects(prev =>
          prev.map(p =>
            p.id === updated.id
              ? { ...p, name: updated.name, lastModified: new Date(updated.updated_at) }
              : p
          )
        );
      }
    } catch {
      /* ignore */
    }
    setEditId(null);
  };

  const deleteProject = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this project?')) return;
    try {
      const res = await fetch(`${REGISTRY_API}/projects/${id}/`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok || res.status === 204) {
        setProjects(prev => prev.filter(p => p.id !== id));
      }
    } catch {
      /* ignore */
    }
  };

  const openProject = async (project: Project) => {
    localStorage.setItem('current-project', JSON.stringify(project));
    resetLaboratory();
    resetExhibition();
    try {
      const res = await fetch(`${REGISTRY_API}/projects/${project.id}/`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.state && data.state.workflow_canvas) {
          localStorage.setItem('workflow-canvas-molecules', safeStringify(data.state.workflow_canvas));
        } else {
          localStorage.removeItem('workflow-canvas-molecules');
        }
        if (data.state && data.state.workflow_selected_atoms) {
          localStorage.setItem('workflow-selected-atoms', safeStringify(data.state.workflow_selected_atoms));
        } else {
          localStorage.removeItem('workflow-selected-atoms');
        }
        if (data.state && data.state.laboratory_config) {
          localStorage.setItem('laboratory-config', safeStringify(data.state.laboratory_config));
          if (data.state.laboratory_config.cards) {
            localStorage.setItem('laboratory-layout-cards', safeStringify(data.state.laboratory_config.cards));
          } else {
            localStorage.removeItem('laboratory-layout-cards');
          }
        } else {
          localStorage.removeItem('laboratory-config');
          localStorage.removeItem('laboratory-layout-cards');
        }
      }
    } catch {
      /* ignore */
    }
    navigate('/workflow');
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100">
      <Header />


      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Projects</h2>
          <p className="text-gray-600">
            {projects.length === 0
              ? `Create your first ${appDetails.title.toLowerCase()} project to get started`
              : `Manage and access your ${appDetails.title.toLowerCase()} projects`}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {/* Create New Project Card */}
          <Card
            className="group cursor-pointer hover:shadow-lg transition-all duration-300 border-2 border-dashed border-gray-200 hover:border-gray-300 bg-white"
            onClick={createNewProject}
          >
            <div className="p-6 flex flex-col items-center justify-center h-48 space-y-4">
              <div className="w-16 h-16 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center group-hover:border-gray-400 group-hover:bg-gray-50 transition-all duration-300">
                <Plus className="w-8 h-8 text-gray-400 group-hover:text-gray-600 transition-colors duration-300" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900 mb-1">Create New Project</h3>
                <p className="text-sm text-gray-500">Start a new analysis</p>
              </div>
            </div>
          </Card>

          {/* Existing Projects */}
          {projects.map((project) => (
            <Card
              key={project.id}
              className="group cursor-pointer hover:shadow-lg transition-all duration-300 border-0 bg-white overflow-hidden"
              onClick={() => openProject(project)}
            >
              <div className="p-6 flex flex-col h-48">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-gray-100 to-gray-200 flex items-center justify-center group-hover:from-gray-200 group-hover:to-gray-300 transition-all duration-300">
                    <FolderOpen className="w-6 h-6 text-gray-600" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <button onClick={(e) => startRename(project, e)} className="p-1" title="Rename">
                      <Pencil className="w-4 h-4 text-gray-500 hover:text-gray-700" />
                    </button>
                    <button onClick={(e) => deleteProject(project.id, e)} className="p-1" title="Delete">
                      <Trash className="w-4 h-4 text-gray-500 hover:text-red-600" />
                    </button>
                  </div>
                </div>

                <div className="flex-1">
                  {editId === project.id ? (
                    <input
                      className="border rounded px-2 py-1 text-sm w-full mb-2"
                      value={editName}
                      autoFocus
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={submitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitRename();
                        e.stopPropagation();
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-gray-700 transition-colors duration-300">
                      {project.name}
                    </h3>
                  )}
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{project.description}</p>
                </div>

                <div className="flex items-center space-x-2 text-gray-400 text-xs">
                  <Calendar className="w-3 h-3" />
                  <span>Modified {project.lastModified?.toLocaleDateString()}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {projects.length === 0 && (
          <div className="text-center mt-16">
            <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-6">
              <Icon className="w-12 h-12 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No projects yet</h3>
            <p className="text-gray-500 mb-6">
              Create your first {appDetails.title.toLowerCase()} project to start analyzing your data.
            </p>
            <Button onClick={createNewProject} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Project
            </Button>
          </div>
        )}

        {/* Footer Message */}
        <div className="text-center mt-16">
          <p className="text-gray-500 text-sm">"The Matrix has you..." - Begin your first project</p>
        </div>
      </div>
    </div>
  );
};

export default Projects;
