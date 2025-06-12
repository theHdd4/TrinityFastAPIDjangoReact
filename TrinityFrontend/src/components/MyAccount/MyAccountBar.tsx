import React from 'react';
import { Button } from '@/components/ui/button';
import { Settings, User, Bell, Search } from 'lucide-react';

const MyAccountBar = () => (
  <div className="flex items-center space-x-4">
    <div className="relative">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
      <input
        type="text"
        placeholder="Search atoms, workflows..."
        className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#458EE2] focus:border-transparent text-sm font-light"
      />
    </div>
    <Button variant="ghost" size="sm" className="p-2">
      <Bell className="w-4 h-4 text-gray-600" />
    </Button>
    <Button variant="ghost" size="sm" className="p-2">
      <Settings className="w-4 h-4 text-gray-600" />
    </Button>
    <Button variant="ghost" size="sm" className="p-2">
      <User className="w-4 h-4 text-gray-600" />
    </Button>
  </div>
);

export default MyAccountBar;
