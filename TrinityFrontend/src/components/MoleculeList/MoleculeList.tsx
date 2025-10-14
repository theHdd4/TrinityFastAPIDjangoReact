
import React, { useEffect, useState } from 'react';
import MoleculeCard from '../WorkflowMode/components/MoleculeCard';
import { molecules as fallbackMolecules } from './data/molecules';
import { USECASES_API } from '@/lib/api';

interface MoleculeListProps {
  canEdit: boolean;
}

interface Molecule {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  tag: string;
  atoms: string[];
}

const MoleculeList: React.FC<MoleculeListProps> = ({ canEdit }) => {
  const [molecules, setMolecules] = useState<Molecule[]>(fallbackMolecules);
  const [loading, setLoading] = useState(false);
  const [appName, setAppName] = useState<string>('');

  useEffect(() => {
    const fetchMoleculesForApp = async () => {
      // Get current app from localStorage
      const currentAppStr = localStorage.getItem('current-app');
      if (!currentAppStr) {
        console.log('No app selected, using fallback molecules');
        setMolecules(fallbackMolecules);
        return;
      }

      try {
        const currentApp = JSON.parse(currentAppStr);
        const appSlug = currentApp.slug;
        
        setLoading(true);
        console.log(`Fetching molecules for app: ${appSlug}`);

        const response = await fetch(`${USECASES_API}/molecules-by-slug/${appSlug}/`, {
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.molecules) {
            console.log(`Loaded ${data.molecules.length} molecules for ${data.app_name}`);
            setMolecules(data.molecules);
            setAppName(data.app_name);
          } else {
            console.log('No molecules found, using fallback');
            setMolecules(fallbackMolecules);
          }
        } else {
          console.log('Failed to fetch molecules, using fallback');
          setMolecules(fallbackMolecules);
        }
      } catch (error) {
        console.error('Error fetching molecules:', error);
        setMolecules(fallbackMolecules);
      } finally {
        setLoading(false);
      }
    };

    fetchMoleculesForApp();
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">
          Molecule Library
          {appName && <span className="text-sm text-gray-500 ml-2">({appName})</span>}
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          {loading ? 'Loading molecules...' : 'Drag molecules to the canvas'}
        </p>
      </div>
      
      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        {molecules.length > 0 ? (
          molecules.map(molecule => (
            <MoleculeCard key={molecule.id} molecule={molecule} canEdit={canEdit} />
          ))
        ) : (
          <div className="text-center text-gray-500 py-8">
            <p>No molecules available for this app</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MoleculeList;
