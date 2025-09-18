import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { BarChart3, Target, Zap, Plus, ArrowRight } from 'lucide-react';
import Header from '@/components/Header';
import GreenGlyphRain from '@/components/animations/GreenGlyphRain';
import { REGISTRY_API } from '@/lib/api';
import { LOGIN_ANIMATION_TOTAL_DURATION } from '@/constants/loginAnimation';

interface BackendApp {
  id: number;
  slug: string;
}

const Apps = () => {
  const navigate = useNavigate();
  const [appMap, setAppMap] = useState<Record<string, number>>({});
  const [playIntro, setPlayIntro] = useState(false);
  const [introBaseDelay, setIntroBaseDelay] = useState(0);

  useEffect(() => {
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

    loadApps();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = sessionStorage.getItem('trinity-login-anim');
    if (!stored) {
      return;
    }

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

    setPlayIntro(true);
    setIntroBaseDelay(0);
  }, []);

  const handleAppSelect = async (appId: string) => {
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

    localStorage.setItem('current-app', JSON.stringify({ id: backendId, slug: appId }));
    try {
      const res = await fetch(`${REGISTRY_API}/apps/${backendId}/`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.environment) {
          console.log('Environment after app select', data.environment);
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

  const apps = [
    {
      id: 'marketing-mix',
      title: 'Marketing Mix Modeling',
      description:
        'Optimize marketing spend allocation across different channels and measure incremental impact',
      icon: Target,
      color: 'from-blue-500 to-purple-600',
      bgGradient: 'from-blue-50 to-purple-50',
      molecules: ['Data Pre-Process', 'Explore'],
    },
    {
      id: 'forecasting',
      title: 'Forecasting Analysis',
      description:
        'Predict future trends and patterns with advanced time series analysis and modeling',
      icon: BarChart3,
      color: 'from-green-500 to-teal-600',
      bgGradient: 'from-green-50 to-teal-50',
      molecules: ['Explore', 'Build'],
    },
    {
      id: 'promo-effectiveness',
      title: 'Promo Effectiveness',
      description:
        'Measure and analyze promotional campaign performance and ROI across touchpoints',
      icon: Zap,
      color: 'from-orange-500 to-red-600',
      bgGradient: 'from-orange-50 to-red-50',
      molecules: ['Data Pre-Process', 'Build'],
    },
    {
      id: 'blank',
      title: 'Create Blank App',
      description:
        'Start from scratch with a clean canvas and build your custom analysis workflow',
      icon: Plus,
      color: 'from-gray-500 to-gray-700',
      bgGradient: 'from-gray-50 to-gray-100',
      molecules: [],
    },
  ];

  const animationStyle = (offset: number) => ({
    animationDelay: `${(introBaseDelay + offset).toFixed(1)}s`,
    animationFillMode: 'both' as const,
    ...(playIntro ? { opacity: 0 } : {}),
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 to-gray-100">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[360px] overflow-hidden animate-fade-in"
        style={animationStyle(0)}
      >
        <GreenGlyphRain className="pointer-events-none opacity-80" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <div className="animate-slide-in-from-top" style={animationStyle(0.2)}>
          <Header />
        </div>

        <main className="flex-1">
          <div
            className="mx-auto max-w-7xl px-6 py-12 animate-fade-in"
            style={animationStyle(0.4)}
          >
        <div
          className="mb-12 text-center animate-scale-in"
          style={animationStyle(0.6)}
        >
          <h2 className="mb-4 text-3xl font-bold text-gray-900">Choose Your Analytics Application</h2>
          <p className="mx-auto max-w-2xl text-lg text-gray-600">
            Select the type of analysis you want to perform. Each application comes with pre-configured templates
            and workflows.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-2">
          {apps.map((app, index) => {
            const Icon = app.icon;
            return (
              <Card
                key={app.id}
                className="group relative cursor-pointer overflow-hidden border border-white/60 bg-white/90 shadow-lg transition-all duration-500 hover:-translate-y-1 hover:shadow-xl animate-slide-in-from-bottom"
                style={animationStyle(0.8 + index * 0.1)}
                onClick={() => handleAppSelect(app.id)}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white via-white to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-70" />
                <div className="relative p-8">
                  <div className="flex items-start space-x-4">
                    <div
                      className={`flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-r ${app.color} text-white shadow-lg transition-transform duration-300 group-hover:scale-110`}
                    >
                      <Icon className="h-8 w-8" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="mb-2 text-xl font-semibold text-gray-900 transition-colors duration-300 group-hover:text-gray-700">
                        {app.title}
                      </h3>
                      <p className="mb-4 text-sm leading-relaxed text-gray-600">{app.description}</p>

                      {app.molecules.length > 0 && (
                        <div className="mb-4">
                          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                            Pre-configured with:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {app.molecules.map((molecule) => (
                              <span
                                key={molecule}
                                className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800"
                              >
                                {molecule}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center text-sm font-medium text-gray-600 transition-colors duration-300 group-hover:text-gray-900">
                        Select Application
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

            <div
              className="mt-16 text-center text-sm text-gray-500 animate-fade-in"
              style={animationStyle(1.2)}
            >
              "The Matrix has you" – pick your path
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Apps;
