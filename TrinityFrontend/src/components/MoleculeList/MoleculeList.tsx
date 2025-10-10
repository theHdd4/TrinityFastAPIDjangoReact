
import React, { useMemo } from 'react';
import MoleculeCard from '../WorkflowMode/components/MoleculeCard';
import { molecules } from './data/molecules';
import { getMoleculesForUseCase } from '@/config/useCaseMolecules';

interface MoleculeListProps {
  canEdit: boolean;
}

const MoleculeList: React.FC<MoleculeListProps> = ({ canEdit }) => {
  // Get current use case from localStorage
  const currentUseCase = useMemo(() => {
    try {
      const currentApp = JSON.parse(localStorage.getItem('current-app') || '{}');
      return currentApp.slug || null;
    } catch (error) {
      console.warn('Failed to parse current app:', error);
      return null;
    }
  }, []);

  // Get use-case-specific molecules
  const useCaseMolecules = useMemo(() => {
    if (currentUseCase) {
      return getMoleculesForUseCase(currentUseCase);
    }
    return [];
  }, [currentUseCase]);

  // Combine use-case-specific molecules with general molecules
  const allMolecules = useMemo(() => {
    const generalMolecules = molecules.map(mol => ({
      ...mol,
      useCaseId: 'general',
      isExclusive: false
    }));
    
    return [...useCaseMolecules, ...generalMolecules];
  }, [useCaseMolecules]);

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Molecule Library</h3>
        <p className="text-sm text-gray-600 mt-1">
          {currentUseCase 
            ? `Molecules for ${currentUseCase.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}`
            : 'Drag molecules to the canvas'
          }
        </p>
      </div>
      
      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        {/* Use Case Specific Molecules */}
        {useCaseMolecules.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3 px-2">
              {currentUseCase?.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} Specific
            </h4>
            <div className="space-y-3 mb-6">
              {useCaseMolecules.map(molecule => (
                <MoleculeCard 
                  key={`${molecule.useCaseId}-${molecule.id}`} 
                  molecule={molecule} 
                  canEdit={canEdit} 
                />
              ))}
            </div>
          </div>
        )}

        {/* General Molecules */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3 px-2">General Molecules</h4>
          <div className="space-y-3">
            {molecules.map(molecule => (
              <MoleculeCard key={`general-${molecule.id}`} molecule={molecule} canEdit={canEdit} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MoleculeList;
