import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Database, Settings, Eye } from 'lucide-react';
import MergeInputFiles from '../MergeInputFiles';
import MergeOptions from '../MergeOptions';
import MergeExhibition from '../MergeExhibition';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { MERGE_API } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface Props {
  atomId: string;
}

const MergeProperties: React.FC<Props> = ({ atomId }) => {
  const [tab, setTab] = useState('inputs');
  const [error, setError] = useState<string | null>(null);
  
  try {
    const { toast } = useToast();
    const atom = useLaboratoryStore(state => state.getAtom(atomId));
    const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
    const settings = (atom?.settings as any) || {
      file1: '',
      file2: '',
      joinColumns: [] as string[],
      joinType: 'inner',
      availableColumns: [] as string[],
    };

    const handleChange = (newSettings: any) => {
      try {
        console.log('🔧 MergeProperties: Updating settings:', newSettings);
        console.log('🔧 MergeProperties: atomId:', atomId);
        updateSettings(atomId, newSettings);
        console.log('🔧 MergeProperties: Settings updated successfully');
      } catch (err) {
        console.error('🔧 MergeProperties: Error updating settings:', err);
        setError('Failed to update settings. Please try again.');
      }
    };

    // Fetch common columns when both files are selected
    React.useEffect(() => {
      if (settings.file1 && settings.file2) {
        console.log('Triggering /init fetch with:', settings.file1, settings.file2);
        fetch(`${MERGE_API}/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            file1: settings.file1,
            file2: settings.file2,
            bucket_name: 'trinity',
          }),
        })
          .then(async r => {
            if (!r.ok) {
              const err = await r.text();
              throw new Error(err);
            }
            return r.json();
          })
          .then(d => {
            const newAvailableColumns = Array.isArray(d.common_columns) ? d.common_columns : [];
            // Preserve existing join columns that are still valid in the new available columns
            const preservedJoinColumns = settings.joinColumns.filter(col => 
              newAvailableColumns.includes(col)
            );
            handleChange({
              ...settings,
              availableColumns: newAvailableColumns,
              joinColumns: preservedJoinColumns,
            });
            setError(null);
          })
          .catch(e => {
            console.error('Failed to fetch join columns:', e);
            setError('Failed to fetch join columns: ' + (e.message || e));
            handleChange({
              ...settings,
              availableColumns: [],
              joinColumns: settings.joinColumns, // Preserve existing join columns even on error
            });
          });
      }
    }, [settings.file1, settings.file2]);

    const handlePerformMerge = async () => {
      console.log('🔧 MergeProperties: handlePerformMerge called with settings:', settings);
      if (!settings.file1 || !settings.file2 || settings.joinColumns.length === 0) {
        toast({
          title: "Error",
          description: "Please select both files and at least one join column before performing merge.",
          variant: "destructive",
        });
        return;
      }
      try {
        console.log('🔧 MergeProperties: Making /perform request with:', {
          file1: settings.file1,
          file2: settings.file2,
          bucket_name: 'trinity',
          join_columns: JSON.stringify(settings.joinColumns),
          join_type: settings.joinType,
        });
        
        const response = await fetch(`${MERGE_API}/perform`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            file1: settings.file1,
            file2: settings.file2,
            bucket_name: 'trinity',
            join_columns: JSON.stringify(settings.joinColumns),
            join_type: settings.joinType,
          }),
        });
        
        console.log('🔧 MergeProperties: Response status:', response.status);
        console.log('🔧 MergeProperties: Response ok:', response.ok);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('🔧 MergeProperties: Error response:', errorText);
          throw new Error(`Merge failed: ${response.statusText} - ${errorText}`);
        }
        
        const result = await response.json();
        console.log('🔧 MergeProperties: Success result:', result);
        
        // Store the merge result without saving to file
        const newSettings = {
          ...settings,
          mergeResults: {
            ...result,
            result_file: null, // No file saved yet
            unsaved_data: result.data // Store the raw data for display
          },
        };
        
        console.log('🔧 MergeProperties: Final newSettings:', newSettings);
        console.log('🔧 MergeProperties: newSettings.mergeResults:', newSettings.mergeResults);
        handleChange(newSettings);
        
        toast({
          title: "Success",
          description: `Merge completed! Result: ${result.row_count} rows, ${result.columns?.length || 0} columns`,
        });
      } catch (error) {
        console.error('🔧 MergeProperties: Merge error:', error);
        setError('Merge failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to perform merge",
          variant: "destructive",
        });
      }
    };

    return (
      <div className="w-full">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
            <p className="text-red-800 text-sm">{error}</p>
            <button 
              onClick={() => setError(null)}
              className="text-red-600 text-xs mt-2 hover:text-red-800"
            >
              Dismiss
            </button>
          </div>
        )}
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mx-4 my-4">
            <TabsTrigger value="inputs" className="text-xs">
              <Database className="w-3 h-3 mr-1" />
              Input Files
            </TabsTrigger>
            <TabsTrigger value="options" className="text-xs">
              <Settings className="w-3 h-3 mr-1" />
              Merge Options
            </TabsTrigger>
            <TabsTrigger value="exhibition" className="text-xs">
              <Eye className="w-3 h-3 mr-1" />
              Exhibition
            </TabsTrigger>
          </TabsList>

          <div className="px-4">
            <TabsContent value="inputs" className="space-y-4" forceMount>
              <MergeInputFiles
                settings={settings}
                onSettingsChange={handleChange}
              />
            </TabsContent>
            <TabsContent value="options" className="space-y-4" forceMount>
              <MergeOptions
                settings={settings}
                onSettingsChange={handleChange}
                onPerformMerge={handlePerformMerge}
              />
            </TabsContent>
            <TabsContent value="exhibition" className="space-y-4" forceMount>
              <MergeExhibition settings={settings} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    );
  } catch (err) {
    console.error('🔧 MergeProperties: Component error:', err);
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800 text-sm">Failed to load merge properties: {err instanceof Error ? err.message : 'Unknown error'}</p>
        </div>
      </div>
    );
  }
};

export default MergeProperties; 