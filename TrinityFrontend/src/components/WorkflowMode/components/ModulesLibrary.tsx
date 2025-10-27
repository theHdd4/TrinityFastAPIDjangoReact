
import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import ModuleCard from './ModuleCard';
import { molecules as fallbackMolecules } from '../../MoleculeList/data/molecules';
import { USECASES_API } from '@/lib/api';

interface Molecule {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  tag: string;
  atoms: string[];
}

const ModulesLibrary = () => {
  const [molecules, setMolecules] = useState<Molecule[]>(fallbackMolecules);
  const [loading, setLoading] = useState(false);

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

        const response = await fetch(`${USECASES_API}/usecases/usecases/molecules-by-slug/${appSlug}/`, {
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.molecules) {
            console.log(`Loaded ${data.molecules.length} molecules for ${data.app_name}`);
            setMolecules(data.molecules);
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
    <div className="bg-card border-t border-border p-6">
      <h3 className="text-lg font-semibold text-foreground mb-6">
        Molecules {loading && '(Loading...)'}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {molecules.map(molecule => (
          <ModuleCard key={molecule.id} molecule={molecule} />
        ))}
      </div>
    </div>
  );
};

export default ModulesLibrary;