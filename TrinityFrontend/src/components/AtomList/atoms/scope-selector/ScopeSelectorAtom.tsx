import React, { useState, useEffect } from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import ScopeSelectorCanvas from './components/ScopeSelectorCanvas';
import ScopeSelectorProperties from './components/properties/ScopeSelectorProperties';

export interface ScopeData {
  id: string;
  name: string;
  identifiers: { [key: string]: string };
  timeframe: {
    from: string;
    to: string;
  };
}

export interface ColumnInfo {
  column_name: string;
  dtype: string;
  // Add other column properties as needed
}

export interface ScopeSelectorData {
  scopes: ScopeData[];
  availableIdentifiers: string[];
  selectedIdentifiers: string[];
  measures?: string[];
  allColumns?: ColumnInfo[];
  dataSource?: string;
}

interface ScopeSelectorAtomProps {
  atomId: string;
  onPropertiesChange?: (properties: any) => void;
}

const ScopeSelectorAtom: React.FC<ScopeSelectorAtomProps> = ({ atomId, onPropertiesChange }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateAtomSettings = useLaboratoryStore(state => state.updateAtomSettings);
  
  // Initialize with default values if settings are empty
  const [data, setData] = useState<ScopeSelectorData>(() => ({
    scopes: [],
    availableIdentifiers: [],
    selectedIdentifiers: [],
    measures: [],
    allColumns: [],
    dataSource: '',
    ...(atom?.settings || {})
  }));

  // Update local state when atom settings change
  React.useEffect(() => {
    if (atom?.settings) {
      setData(prev => ({
        scopes: [],
        availableIdentifiers: [],
        selectedIdentifiers: [],
        measures: [],
        allColumns: [],
        dataSource: '',
        ...prev, // Keep any existing state that's not in settings
        ...atom.settings // Override with settings from store
      }));
    }
  }, [atom?.settings]);

  const handleDataChange = (newData: Partial<ScopeSelectorData>) => {
    const updatedData = { ...data, ...newData };
    setData(updatedData);
    
    // Update the store with the new data
    updateAtomSettings(atomId, updatedData);
    
    // Notify parent component
    onPropertiesChange?.({ 
      ...updatedData,
      propertiesComponent: ScopeSelectorProperties 
    });
  };

  return (
    <div className="w-full h-full">
      <ScopeSelectorCanvas data={data} onDataChange={handleDataChange} atomId={atomId} />
    </div>
  );
};

export { ScopeSelectorProperties };
export default ScopeSelectorAtom;