
import React, { useEffect, useState } from 'react';

import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  TrinityAssets,
  AppIdentity,
  Searchbar,
  MyProfile,
  Navigation,
} from '@/components/PrimaryMenu';
import { Target, BarChart3, Zap, Plus, FolderOpen } from 'lucide-react';

interface HeaderProps {
  projectCount?: number;
}

const Header: React.FC<HeaderProps> = ({ projectCount = 0 }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState<string | null>(null);
  const [appInfo, setAppInfo] = useState<{ title: string; Icon: any; color: string } | null>(null);

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
              setAppInfo({
                title: 'Marketing Mix Modeling',
                Icon: Target,
                color: 'from-blue-500 to-purple-600'
              });
              break;
            case 'forecasting':
              setAppInfo({
                title: 'Forecasting Analysis',
                Icon: BarChart3,
                color: 'from-green-500 to-teal-600'
              });
              break;
            case 'promo-effectiveness':
              setAppInfo({
                title: 'Promo Effectiveness',
                Icon: Zap,
                color: 'from-orange-500 to-red-600'
              });
              break;
            case 'blank':
              setAppInfo({ title: 'Blank App', Icon: Plus, color: 'from-gray-500 to-gray-700' });
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

  const handleRename = (name: string) => {
    setProjectName(name);
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
            <AppIdentity
              projectName={projectName}
              onGoBack={handleGoBack}
              onRename={handleRename}
            />
            <Searchbar />
          </>
        )}

        {isProjects && appInfo && (() => {
          const IconComp = appInfo.Icon;
          return (
            <div className="flex items-center space-x-3">
              <div className="flex items-center text-sm text-gray-500">
                <FolderOpen className="w-4 h-4 mr-1" />
                <span>{projectCount}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-800">{appInfo.title}</span>
                <div
                  className={`w-8 h-8 rounded-lg bg-gradient-to-r ${appInfo.color} flex items-center justify-center shadow-md`}
                >
                  <IconComp className="w-4 h-4 text-white" />
                </div>
              </div>
              <button type="button" onClick={handleGoBack} className="p-2" title="Back to Apps">
                <TrinityAssets.BackToAppsIcon className="w-5 h-5" />
              </button>
            </div>
          );
        })()}

        <MyProfile.NotificationMenu />
        <MyProfile.SettingsMenu />
        <MyProfile.ProfileMenu />
      </div>
    </header>
  );
};

export default Header;
