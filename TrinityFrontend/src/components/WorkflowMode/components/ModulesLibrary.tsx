
import React from 'react';
import { Card } from '@/components/ui/card';
import ModuleCard from './ModuleCard';
import { molecules } from '../../MoleculeList/data/molecules';

const ModulesLibrary = () => {
  return (
    <div className="bg-white border-t border-gray-200 p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-6">Molecules</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {molecules.map(molecule => (
          <ModuleCard key={molecule.id} molecule={molecule} />
        ))}
      </div>
    </div>
  );
};

export default ModulesLibrary;
