
import React, { useEffect, useState } from 'react';

import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  TrinityAssets,
  AppIdentity,
  Searchbar,
  MyProfile,
  Navigation,
} from '@/components/PrimaryMenu';

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState<string | null>(null);

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
  }, []);

  const handleGoBack = () => {
    navigate('/apps');
  };

  const simpleHeader =
    location.pathname.startsWith('/apps') ||
    location.pathname.startsWith('/projects');

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
        <MyProfile.NotificationMenu />
        <MyProfile.SettingsMenu />
        <MyProfile.ProfileMenu />
      </div>
    </header>
  );
};

export default Header;
