
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import Header from '@/components/Header';
import { BarChart3, Target, Zap, Plus, ArrowRight } from 'lucide-react';
import { REGISTRY_API } from '@/lib/api';
import LoadingAnimation from '@/templates/LoadingAnimation/LoadingAnimation';

interface BackendApp {
  id: number;
  slug: string;
}

const Apps = () => {
  const navigate = useNavigate();
  const [appMap, setAppMap] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('Initializing Trinity interface...');


  const loadApps = async () => {
    console.log('Fetching apps from backend...');
    setIsLoading(true);
    setLoadingStatus('Contacting Trinity mainframe...');
    try {
      const res = await fetch(`${REGISTRY_API}/apps/`, { credentials: 'include' });
      console.log('Apps response status', res.status);
      if (res.ok) {
        setLoadingStatus('Decrypting available experiences...');
        const data: BackendApp[] = await res.json();
        console.log('Loaded apps', data);
        setLoadingStatus('Calibrating analytics modules...');
        const map: Record<string, number> = {};
        data.forEach((a) => {
          map[a.slug] = a.id;
        });
        setAppMap(map);
        setLoadingStatus('Synchronizing interface...');
        setTimeout(() => setIsLoading(false), 300);
      } else {
        const text = await res.text();
        console.log('Failed to load apps:', text);
        setLoadingStatus('Unable to load applications. Please try again.');
        setTimeout(() => setIsLoading(false), 800);
      }
    } catch (err) {
      console.log('Apps fetch error', err);
      setLoadingStatus('Connection lost. Attempting reconnection...');
      setTimeout(() => setIsLoading(false), 800);
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
      color: 'from-green-500 to-teal-600',
      bgGradient: 'from-green-50 to-teal-50',
      molecules: ['Explore', 'Build']
    },
    {
      id: 'marketing-mix',
      title: 'Marketing Mix Modeling',
      description: 'Optimize marketing spend allocation across different channels',
      icon: Target,
      color: 'from-blue-500 to-purple-600',
      bgGradient: 'from-blue-50 to-purple-50',
      molecules: ['Data Pre-Process', 'Explore']
    },
    {
      id: 'promo-effectiveness',
      title: 'Promo Effectiveness',
      description: 'Measure and analyze promotional campaign performance',
      icon: Zap,
      color: 'from-orange-500 to-red-600',
      bgGradient: 'from-orange-50 to-red-50',
      molecules: ['Data Pre-Process', 'Build']
    },
    {
      id: 'blank',
      title: 'Create Blank App',
      description: 'Start from scratch with a clean canvas',
      icon: Plus,
      color: 'from-gray-500 to-gray-700',
      bgGradient: 'from-gray-50 to-gray-100',
      molecules: []
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
    try {
      const res = await fetch(`${REGISTRY_API}/apps/${backendId}/`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.environment) {
          console.log('Environment after app select', data.environment);
          // Persist the full environment (including identifiers). Explicitly
          // set the current app's slug/id so the session namespace reflects
          // the user's selection even if the backend omits these fields.
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

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-50 to-gray-100">
      {isLoading && (
        <LoadingAnimation status={loadingStatus} className="z-20" />
      )}
      <Header />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Choose Your Analytics Application</h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Select the type of analysis you want to perform. Each application comes with pre-configured templates and workflows.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {apps.map((app) => {
            const Icon = app.icon;
            return (
              <Card
                key={app.id}
                className="group cursor-pointer hover:shadow-lg transition-all duration-300 border-0 bg-white overflow-hidden"
                onClick={() => handleAppSelect(app.id)}
              >
                <div className="p-8">
                  <div className="flex items-start space-x-4">
                    <div className={`w-16 h-16 rounded-xl bg-gradient-to-r ${app.color} flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                      <Icon className="w-8 h-8 text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-gray-700 transition-colors">
                        {app.title}
                      </h3>
                      <p className="text-gray-600 text-sm leading-relaxed mb-4">
                        {app.description}
                      </p>

                      {app.molecules.length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs font-medium text-gray-500 mb-2">Pre-configured with:</p>
                          <div className="flex flex-wrap gap-2">
                            {app.molecules.map((molecule, index) => (
                              <span
                                key={index}
                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                              >
                                {molecule}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">
                        Select Application
                        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-300" />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="text-center mt-16">
          <p className="text-gray-500 text-sm">"The Matrix has you" - pick your path</p>
        </div>
      </div>
    </div>
  );
};

export default Apps;
