
import React, { useEffect, useState } from 'react';

import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  TrinityAssets,
  AppIdentity,
  Searchbar,
  MyProfile,
  Navigation,
} from '@/components/PrimaryMenu';
import { Target, BarChart3, Zap, Plus } from 'lucide-react';

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState<string | null>(null);
  const [appInfo, setAppInfo] = useState<{ title: string; Icon: any } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('current-project');
    if (saved) {
      try {
        const proj = JSON.parse(saved);
        setProjectName(proj.name);
      } catch {
        /* ignore corrupted project */
      }
    }

    if (location.pathname.startsWith('/projects')) {
      try {
        const appStr = localStorage.getItem('current-app');
        if (appStr) {
          const { slug } = JSON.parse(appStr);
          switch (slug) {
            case 'marketing-mix':
              setAppInfo({ title: 'Marketing Mix Modeling', Icon: Target });
              break;
            case 'forecasting':
              setAppInfo({ title: 'Forecasting Analysis', Icon: BarChart3 });
              break;
            case 'promo-effectiveness':
              setAppInfo({ title: 'Promo Effectiveness', Icon: Zap });
              break;
            case 'blank':
              setAppInfo({ title: 'Blank App', Icon: Plus });
              break;
            default:
              setAppInfo(null);
          }
        }
      } catch {
        setAppInfo(null);
      }
    } else {
      setAppInfo(null);
    }
  }, [location.pathname]);

  const handleGoBack = () => {
    localStorage.removeItem('current-app');
    navigate('/apps');
  };

  const isProjects = location.pathname.startsWith('/projects');
  const simpleHeader =
    location.pathname.startsWith('/apps') || isProjects;

  return (
    <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shadow-sm">
      <div className="flex items-center space-x-10">
        <Link to="/" className="flex items-center space-x-3 group">
          <TrinityAssets.AnimatedLogo className="w-12 h-12 group-hover:shadow-xl transition-all duration-300" />
          <TrinityAssets.LogoText />
        </Link>
        
        {!simpleHeader && <Navigation />}
      </div>

      <div className="flex items-center space-x-4">
        {!simpleHeader && (
          <>
            <AppIdentity projectName={projectName} onGoBack={handleGoBack} />
            <Searchbar />
          </>
        )}

        {isProjects && appInfo && (() => { const IconComp = appInfo.Icon; return (
          <>
            <span className="text-sm text-gray-600 text-right">{appInfo.title}</span>
            <IconComp className="w-5 h-5 text-gray-600" />
            <button type="button" onClick={handleGoBack} className="p-2" title="Back to Apps">
              <TrinityAssets.BackToAppsIcon className="w-5 h-5" />
            </button>
          </>
        ); })()}

        <MyProfile.NotificationMenu />
        <MyProfile.SettingsMenu />
        <MyProfile.ProfileMenu />
      </div>
    </header>
  );
};

export default Header;
