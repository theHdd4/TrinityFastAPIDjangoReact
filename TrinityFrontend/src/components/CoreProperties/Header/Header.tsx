
import React from 'react';
import { Link } from 'react-router-dom';
import PrimaryMenu from '@/components/PrimaryMenu';
import MyAccountBar from '@/components/MyAccount';
import AnimatedLogo from '@/components/AnimatedLogo';

const Header = () => {

  return (
    <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between shadow-sm">
      <div className="flex items-center space-x-10">
        <Link to="/" className="flex items-center space-x-3">
          <AnimatedLogo className="w-8 h-8" />
          <h1 className="text-2xl font-light text-gray-900">Trinity</h1>
        </Link>
        
        <PrimaryMenu />
      </div>
      <MyAccountBar />
    </header>
  );
};

export default Header;
