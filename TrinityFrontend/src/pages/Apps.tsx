
import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Zap, BarChart3, Target, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import Header from '@/components/Header';
import AppCard from '@/components/AppList/AppCard';
import { REGISTRY_API } from '@/lib/api';
import { molecules } from '@/components/MoleculeList/data/molecules';
import { safeStringify } from '@/utils/safeStringify';

interface BackendApp {
  id: number;
  slug: string;
}

const Apps = () => {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [appMap, setAppMap] = useState<Record<string, number>>({});

  // Default molecules to preload for each app template
  const templates: Record<string, string[]> = {
    'marketing-mix': ['data-pre-process', 'build'],
    forecasting: ['data-pre-process', 'explore'],
    'promo-effectiveness': ['explore', 'build'],
    blank: []
  };

  const loadApps = async () => {
    console.log('Fetching apps from backend...');
    try {
      const res = await fetch(`${REGISTRY_API}/apps/`, { credentials: 'include' });
      console.log('Apps response status', res.status);
      if (res.ok) {
        const data: BackendApp[] = await res.json();
        console.log('Loaded apps', data);
        const map: Record<string, number> = {};
        data.forEach((a) => {
          map[a.slug] = a.id;
        });
        setAppMap(map);
      } else {
        const text = await res.text();
        console.log('Failed to load apps:', text);
      }
    } catch (err) {
      console.log('Apps fetch error', err);
    }
  };

  useEffect(() => {
    loadApps();
  }, []);

  const apps = [
    {
      id: 'forecasting',
      title: 'Forecasting Analysis',
      description: 'Predict future trends and patterns with advanced time series analysis',
      icon: BarChart3,
      templates: ['Explore', 'Build'],
      color: 'bg-trinity-yellow',
      borderColor: 'border-trinity-yellow/30'
    },
    {
      id: 'marketing-mix',
      title: 'Marketing Mix Modeling',
      description: 'Optimize marketing spend allocation across different channels',
      icon: Target,
      templates: ['Data Pre-Process', 'Explore'],
      color: 'bg-trinity-yellow',
      borderColor: 'border-trinity-yellow/30'
    },
    {
      id: 'promo-effectiveness',
      title: 'Promo Effectiveness',
      description: 'Measure and analyze promotional campaign performance',
      icon: Zap,
      templates: ['Data Pre-Process', 'Build'],
      color: 'bg-trinity-yellow',
      borderColor: 'border-trinity-yellow/30'
    },
    {
      id: 'blank',
      title: 'Create Blank App',
      description: 'Start from scratch with a clean canvas',
      icon: Plus,
      templates: [],
      color: 'bg-trinity-yellow',
      borderColor: 'border-trinity-yellow/30'
    }
  ];


const handleAppSelect = async (appId: string) => {
  // Ensure we have a mapping from slug to backend ID
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

  localStorage.setItem(
    'current-app',
    JSON.stringify({ id: backendId, slug: appId })
  );
  navigate(`/projects?app=${appId}`);
};

  return (
    <div className="min-h-screen bg-white flex flex-col">

      <Header />

      <div className="relative z-10 p-8">
        <Button
          variant="ghost"
          onClick={() => {
            const stored = localStorage.getItem('current-app');
            if (stored) {
              try {
                const obj = JSON.parse(stored);
                navigate(`/projects?app=${obj.slug}`);
              } catch {
                navigate('/projects');
              }
            } else {
              navigate('/projects');
            }
          }}
          className="text-black hover:bg-trinity-yellow/10"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Projects
        </Button>
        <div className="mt-4">
          <h1 className="text-3xl font-light text-black">Choose Your Trinity App</h1>
          <p className="text-black/60 text-sm">Select an application template to initialize</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex-1 px-8 pb-8 flex items-center justify-center">
        <div className="max-w-6xl mx-auto relative">
          <button
            type="button"
            onClick={() => scrollRef.current?.scrollBy({ left: -scrollRef.current!.clientWidth, behavior: 'smooth' })}
            className="absolute -left-12 top-1/2 -translate-y-1/2 p-3 bg-trinity-yellow text-white rounded-full shadow-lg hover:bg-trinity-yellow/90"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={() => scrollRef.current?.scrollBy({ left: scrollRef.current!.clientWidth, behavior: 'smooth' })}
            className="absolute -right-12 top-1/2 -translate-y-1/2 p-3 bg-trinity-yellow text-white rounded-full shadow-lg hover:bg-trinity-yellow/90"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <div ref={scrollRef} className="flex overflow-x-auto space-x-6 pb-4 snap-x snap-mandatory scroll-smooth">
            {apps.map((app) => (
              <div key={app.id} className="w-1/2 flex-shrink-0 snap-center">
                <AppCard
                  app={app}
                  onSelect={() => handleAppSelect(app.id)}
                />
              </div>
            ))}
          </div>

          {/* Footer Message */}
          <div className="text-center mt-16">
            <p className="text-black/50 text-sm">
              "Choice is an illusion" - But we give you options anyway
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Apps;
