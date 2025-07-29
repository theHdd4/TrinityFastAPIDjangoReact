import React from 'react';
import { Search } from 'lucide-react';

const Searchbar: React.FC = () => (
  <div className="relative">
    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
    <input
      type="text"
      placeholder="Search atoms, workflows..."
      className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-trinity-blue focus:border-transparent text-sm font-light"
    />
  </div>
);

export default Searchbar;
