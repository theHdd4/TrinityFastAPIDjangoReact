
import React, { useEffect, useState, useMemo } from 'react';
import MoleculeCard from '../WorkflowMode/components/MoleculeCard';
import { molecules as fallbackMolecules } from './data/molecules';
import { USECASES_API, CUSTOM_MOLECULES_API } from '@/lib/api';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

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
  const [qmMolecules, setQmMolecules] = useState<Molecule[]>(fallbackMolecules);
  const [clientMolecules, setClientMolecules] = useState<Molecule[]>([]);
  const [loading, setLoading] = useState(false);
  const [appName, setAppName] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  const handleDeleteCustomMolecule = (moleculeId: string) => {
    // Remove the molecule from the client molecules list
    setClientMolecules(prev => prev.filter(molecule => molecule.id !== moleculeId));
    console.log(`Custom molecule ${moleculeId} deleted from UI`);
  };

  useEffect(() => {
    const fetchMoleculesForApp = async () => {
      // Get current app from localStorage
      const currentAppStr = localStorage.getItem('current-app');
      if (!currentAppStr) {
        console.log('No app selected, using fallback molecules');
        setQmMolecules(fallbackMolecules);
        setClientMolecules([]);
        return;
      }

      try {
        const currentApp = JSON.parse(currentAppStr);
        const appSlug = currentApp.slug;
        
        setLoading(true);
        console.log(`Fetching molecules for app: ${appSlug}`);

        // Fetch QM molecules (existing functionality)
        const qmResponse = await fetch(`${USECASES_API}/usecases/molecules-by-slug/${appSlug}/`, {
          credentials: 'include'
        });

        if (qmResponse.ok) {
          const data = await qmResponse.json();
          if (data.success && data.molecules) {
            console.log(`Loaded ${data.molecules.length} QM molecules for ${data.app_name}`);
            setQmMolecules(data.molecules);
            setAppName(data.app_name);
          } else {
            console.log('No QM molecules found, using fallback');
            setQmMolecules(fallbackMolecules);
          }
        } else {
          console.log('Failed to fetch QM molecules, using fallback');
          setQmMolecules(fallbackMolecules);
        }

        // Fetch Custom molecules from Django API (tenant schema)
        try {
          // Custom molecules are now shared across all projects for a tenant
          // No need to pass project_id for fetching
          const customResponse = await fetch(`${CUSTOM_MOLECULES_API}/for_frontend/`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include'
          });

          if (customResponse.ok) {
            const customData = await customResponse.json();
            if (customData.success && customData.molecules) {
              console.log(`Loaded ${customData.molecules.length} custom molecules`);
              // Convert the custom molecules format to match the expected interface
              const formattedMolecules = customData.molecules.map((mol: any) => ({
                id: mol.id,
                type: mol.type,
                title: mol.title,
                subtitle: mol.subtitle,
                tag: mol.tag,
                atoms: mol.atoms || []
              }));
              setClientMolecules(formattedMolecules);
            }
          } else {
            console.log('Failed to fetch custom molecules');
            setClientMolecules([]);
          }
        } catch (customError) {
          console.error('Error fetching custom molecules:', customError);
          setClientMolecules([]);
        }

      } catch (error) {
        console.error('Error fetching molecules:', error);
        setQmMolecules(fallbackMolecules);
        setClientMolecules([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMoleculesForApp();
  }, []);

  // Filter molecules based on search term
  const filteredQmMolecules = useMemo(() => {
    if (!searchTerm.trim()) return qmMolecules;
    
    return qmMolecules.filter(molecule => 
      molecule.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      molecule.subtitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      molecule.atoms.some(atom => atom.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [qmMolecules, searchTerm]);

  const filteredClientMolecules = useMemo(() => {
    if (!searchTerm.trim()) return clientMolecules;
    
    return clientMolecules.filter(molecule => 
      molecule.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      molecule.subtitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      molecule.atoms.some(atom => atom.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [clientMolecules, searchTerm]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="qm-molecules" className="h-full flex flex-col">
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="qm-molecules">QM Molecules</TabsTrigger>
              <TabsTrigger value="client-molecules">Custom Molecules</TabsTrigger>
            </TabsList>
          </div>
          
          {/* Search Input */}
          <div className="px-6 pt-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search molecules..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 text-sm border-gray-200 focus:border-blue-300 focus:ring-1 focus:ring-blue-300"
              />
            </div>
          </div>
          
          <TabsContent value="qm-molecules" className="flex-1 overflow-y-auto p-6 space-y-4 m-0">
            {filteredQmMolecules.length > 0 ? (
              filteredQmMolecules.map(molecule => (
                <MoleculeCard key={molecule.id} molecule={molecule} canEdit={canEdit} />
              ))
            ) : searchTerm.trim() ? (
              <div className="text-center text-gray-500 py-8">
                <p>No QM molecules found matching "{searchTerm}"</p>
                <p className="text-xs text-gray-400 mt-2">
                  Try searching for molecule names or atom names
                </p>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                <p>No QM molecules available for this app</p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="client-molecules" className="flex-1 overflow-y-auto p-6 space-y-4 m-0">
            {filteredClientMolecules.length > 0 ? (
              filteredClientMolecules.map(molecule => (
                <MoleculeCard 
                  key={molecule.id} 
                  molecule={molecule} 
                  canEdit={canEdit} 
                  onDelete={handleDeleteCustomMolecule}
                />
              ))
            ) : searchTerm.trim() ? (
              <div className="text-center text-gray-500 py-8">
                <p>No custom molecules found matching "{searchTerm}"</p>
                <p className="text-xs text-gray-400 mt-2">
                  Try searching for molecule names or atom names
                </p>
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                <p>No custom molecules saved yet</p>
                <p className="text-xs text-gray-400 mt-2">
                  Save molecules from the canvas to see them here
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default MoleculeList;
