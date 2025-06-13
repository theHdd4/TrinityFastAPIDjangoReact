
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

import { Link, useLocation, useNavigate } from 'react-router-dom';
import AnimatedLogo from '@/components/AnimatedLogo';
import BackToAppsIcon from '@/components/icons/BackToAppsIcon';
import NotificationMenu from '@/components/NotificationMenu';
import SettingsMenu from '@/components/SettingsMenu';
import ProfileMenu from '@/components/ProfileMenu';

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
          <AnimatedLogo className="w-12 h-12 group-hover:shadow-xl transition-all duration-300" />
          
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-black via-gray-800 to-trinity-yellow bg-clip-text text-transparent tracking-tight leading-none font-mono">
              Trinity
            </h1>
            <span className="text-xs font-light text-gray-600 tracking-widest uppercase mt-0.5 font-mono">
              A Quant Matrix AI Product
            </span>
          </div>
        </Link>
        
        {!simpleHeader && (
          <nav className="flex items-center space-x-8">
            <Link
              to="/workflow"
              className={`font-light text-sm transition-colors ${
                location.pathname === '/workflow'
                  ? 'text-trinity-blue border-b-2 border-trinity-blue pb-1'
                  : 'text-gray-600 hover:text-trinity-blue'
              }`}
            >
              Workflow
            </Link>
            <Link
              to="/laboratory"
              className={`font-light text-sm transition-colors ${
                location.pathname === '/laboratory'
                  ? 'text-trinity-blue border-b-2 border-trinity-blue pb-1'
                  : 'text-gray-600 hover:text-trinity-blue'
              }`}
            >
              Laboratory
            </Link>
            <Link
              to="/exhibition"
              className={`font-light text-sm transition-colors ${
                location.pathname === '/exhibition'
                  ? 'text-trinity-blue border-b-2 border-trinity-blue pb-1'
                  : 'text-gray-600 hover:text-trinity-blue'
              }`}
            >
              Exhibition
            </Link>
          </nav>
        )}
      </div>

      <div className="flex items-center space-x-4">
        {projectName && !simpleHeader && (
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <span>{projectName}</span>
            <button
              type="button"
              onClick={handleGoBack}
              className="p-2 text-black"
              title="Go back to app menu"
            >
              <BackToAppsIcon className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search atoms, workflows..."
            className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-trinity-blue focus:border-transparent text-sm font-light"
          />
        </div>
        
        <NotificationMenu />
        <SettingsMenu />
        <ProfileMenu />
      </div>
    </header>
  );
};

export default Header;