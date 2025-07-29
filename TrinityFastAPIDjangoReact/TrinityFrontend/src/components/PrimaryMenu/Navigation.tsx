import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const PrimaryMenu = () => {
  const location = useLocation();
  return (
    <nav className="flex items-center space-x-8">
      <Link
        to="/workflow"
        className={`font-light text-sm transition-colors ${
          location.pathname === '/workflow'
            ? 'text-[#458EE2] border-b-2 border-[#458EE2] pb-1'
            : 'text-gray-600 hover:text-[#458EE2]'
        }`}
      >
        Workflow
      </Link>
      <Link
        to="/laboratory"
        className={`font-light text-sm transition-colors ${
          location.pathname === '/laboratory'
            ? 'text-[#458EE2] border-b-2 border-[#458EE2] pb-1'
            : 'text-gray-600 hover:text-[#458EE2]'
        }`}
      >
        Laboratory
      </Link>
      <Link
        to="/exhibition"
        className={`font-light text-sm transition-colors ${
          location.pathname === '/exhibition'
            ? 'text-[#458EE2] border-b-2 border-[#458EE2] pb-1'
            : 'text-gray-600 hover:text-[#458EE2]'
        }`}
      >
        Exhibition
      </Link>
    </nav>
  );
};

export default PrimaryMenu;
