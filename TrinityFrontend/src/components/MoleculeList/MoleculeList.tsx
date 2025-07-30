
import React from 'react';
import { Card } from '@/components/ui/card';
import MoleculeCard from '../WorkflowMode/components/MoleculeCard';
import { molecules } from './data/molecules';

const MoleculeList = () => {
  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Molecule Library</h3>
        <p className="text-sm text-gray-600 mt-1">Drag molecules to the canvas</p>
      </div>
      
      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        {molecules.map(molecule => (
          <MoleculeCard key={molecule.id} molecule={molecule} />
        ))}
      </div>
    </div>
  );
};

export default MoleculeList;
