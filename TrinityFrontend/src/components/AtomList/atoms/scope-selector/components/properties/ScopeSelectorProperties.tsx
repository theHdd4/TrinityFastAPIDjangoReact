import React, { useState, useCallback, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Settings, Eye } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import ScopeSelectorInputFiles from '../ScopeSelectorInputFiles';
import ScopeSelectorSettings from '../ScopeSelectorSettings';
import ScopeSelectorExhibition from '../ScopeSelectorExhibition';
import { ScopeSelectorData } from '../../ScopeSelectorAtom';

interface ScopeSelectorPropertiesProps {
  atomId: string;
}

const ScopeSelectorProperties: React.FC<ScopeSelectorPropertiesProps> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateAtomSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const updateSettings = useCallback((newSettings: Partial<ScopeSelectorData>) => {
    // Merge new settings with existing ones
    const currentSettings = atom?.settings || {};
    const safeSettings = {
      ...currentSettings,
      ...newSettings,
      // Ensure arrays are always defined but don't override if they exist
      scopes: newSettings.scopes || currentSettings.scopes || [],
      availableIdentifiers: newSettings.availableIdentifiers || currentSettings.availableIdentifiers || [],
      selectedIdentifiers: newSettings.selectedIdentifiers || currentSettings.selectedIdentifiers || []
    };
    updateAtomSettings(atomId, safeSettings);
  }, [updateAtomSettings, atomId, atom?.settings]);

  // Initialize with default values if settings are empty
  useEffect(() => {
    if (atom && (!atom.settings || Object.keys(atom.settings).length === 0)) {
      updateSettings({
        scopes: [],
        availableIdentifiers: [],
        selectedIdentifiers: []
      });
    }
  }, [atom, updateSettings]);
  // Ensure settings has all required fields with defaults
  const settings: ScopeSelectorData = {
    scopes: [],
    availableIdentifiers: [],
    selectedIdentifiers: [],
    ...(atom?.settings || {})
  };
  const [tab, setTab] = useState('inputs');

  if (!atom) {
    return (
      <div className="w-full h-full flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚙️</span>
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">No Scope Data</h3>
          <p className="text-sm text-gray-600">The Scope Selector atom needs to be configured first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="inputs" className="text-xs font-medium">
            <Upload className="w-3 h-3 mr-1" />
            Input
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs font-medium">
            <Settings className="w-3 h-3 mr-1" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="exhibition" className="text-xs font-medium">
            <Eye className="w-3 h-3 mr-1" />
            Exhibition
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inputs" className="flex-1 mt-0" forceMount>
          <ScopeSelectorInputFiles atomId={atomId} />
        </TabsContent>

        <TabsContent value="settings" className="flex-1 mt-0" forceMount>
          <ScopeSelectorSettings 
            data={settings} 
            onDataChange={(newData) => updateSettings(newData)} 
          />
        </TabsContent>

        <TabsContent value="exhibition" className="flex-1 mt-0" forceMount>
          <ScopeSelectorExhibition data={settings as any} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ScopeSelectorProperties;