import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { VALIDATE_API, FEATURE_OVERVIEW_API, CLUSTERING_API } from '@/lib/api';
import { Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  atomId: string;
}

interface SavedDataFrame {
  object_name: string;
  csv_name: string;
  size?: number;
  last_modified?: string;
}

const ClusteringInputFiles: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings = atom?.settings || {};
  const { toast } = useToast();
  
  const clusteringData = settings.clusteringData || {};
  const [availableFiles, setAvailableFiles] = useState<SavedDataFrame[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Fetch available files when component mounts - only once
  useEffect(() => {
    const fetchFiles = async () => {
      setLoading(true);
      try {
        console.log('Fetching files from:', `${VALIDATE_API}/list_saved_dataframes`);
        const response = await fetch(`${VALIDATE_API}/list_saved_dataframes`);
        console.log('Response status:', response.status, response.statusText);
        
        if (response.ok) {
          const data = await response.json();
          console.log('Files response data:', data);
          const files = Array.isArray(data.files) ? data.files : [];
          console.log('Processed files:', files);
          setAvailableFiles(files);
        } else {
          console.error('Failed to fetch files:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('Error fetching files:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
  }, []); // Only run once on mount

  // Manual fetch columns when file is selected - no useEffect loop
  const handleFileSelect = async (fileName: string) => {
    console.log('File selected:', fileName);
    setSelectedFile(fileName);
    
    if (!fileName) return;
    
    setLoading(true);
    try {
      // Fetch column summary
      const response = await fetch(`${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(fileName)}`);
      if (response.ok) {
        const data = await response.json();
        const summaryData = Array.isArray(data.summary) ? data.summary.filter(Boolean) : [];
        
        // Auto-identify identifiers and measures based on data types (but don't auto-select)
        const identifiers = summaryData
          .filter((col: any) => {
            const dataType = col.data_type?.toLowerCase() || '';
            return (dataType === 'object' || dataType === 'category' || dataType === 'string' || 
                   dataType === 'datetime64[ns]' || dataType === 'bool') && col.column;
          })
          .map((col: any) => col.column);
        
        const measures = summaryData
          .filter((col: any) => {
            const dataType = col.data_type?.toLowerCase() || '';
            return (dataType.includes('int') || dataType.includes('float') || dataType.includes('number')) && col.column;
          })
          .map((col: any) => col.column);
        
        // Update store with selected file and available columns (but not selected ones)
        updateSettings(atomId, {
          clusteringData: {
            ...clusteringData,
            selectedDataFile: fileName,
            objectName: fileName,
            allColumns: summaryData.map((col: any) => col.column),
            availableIdentifiers: identifiers,
            availableMeasures: measures,
            selectedIdentifiers: [], // Start with empty selection
            selectedMeasures: []     // Start with empty selection
          }
        });
      } else {
        console.error('Failed to fetch columns:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching columns:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-2">
      <Card className="p-4 space-y-3">
        <label className="text-sm font-medium text-gray-700 block">Data Source</label>
        <Select onValueChange={handleFileSelect} value={selectedFile}>
          <SelectTrigger className="bg-white border-gray-300">
            <SelectValue placeholder="Choose a saved dataframe..." />
          </SelectTrigger>
          <SelectContent>
            {Array.isArray(availableFiles) && availableFiles.map((file) => (
              <SelectItem key={file.object_name} value={file.object_name}>
                {file.csv_name ? file.csv_name.split('/').pop() : file.object_name.split('/').pop()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>


      {/* Output Path Section - Shows after saving dataframe */}
      {clusteringData.outputPath && clusteringData.outputPath.trim() !== '' && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Output File</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="output-path" className="text-sm font-medium text-gray-700 mb-2 block">
                Current File Name:
              </Label>
              <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-sm text-gray-600 font-mono">
                {clusteringData.outputPath.split('/').pop() || clusteringData.outputPath}
              </div>
            </div>
            
            <div>
              <Label htmlFor="custom-filename" className="text-sm font-medium text-gray-700 mb-2 block">
                Custom Filename:
              </Label>
              <div className="flex gap-2">
                <Input
                  id="custom-filename"
                  value={clusteringData.outputFilename || ''}
                  onChange={(e) => {
                    updateSettings(atomId, {
                      clusteringData: {
                        ...clusteringData,
                        outputFilename: e.target.value
                      }
                    });
                  }}
                  placeholder="Enter custom filename (without extension)"
                  className="flex-1"
                />
                <Button
                  onClick={async () => {
                    if (!clusteringData.outputPath || !clusteringData.outputFilename || 
                        clusteringData.outputPath.trim() === '' || clusteringData.outputFilename.trim() === '') {
                      toast({
                        title: 'Missing information',
                        description: 'Please ensure both output path and filename are set.',
                        variant: 'destructive',
                      });
                      return;
                    }
                    
                    // Debug: Log what we're sending
                    const requestData = {
                      old_path: clusteringData.outputPath,
                      new_filename: clusteringData.outputFilename
                    };

                    
                    try {
                      const response = await fetch(`${process.env.NEXT_PUBLIC_CLUSTERING_API || '/api/clustering'}/rename`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(requestData),
                      });
                      
                      
                      if (response.ok) {
                        const result = await response.json();
                        
                        // Update the local state with the new path
                        updateSettings(atomId, {
                          clusteringData: {
                            ...clusteringData,
                            outputPath: result.new_path
                          }
                        });
                        
                        // Show success message
                        toast({
                          title: 'File renamed successfully!',
                        });
                      } else {
                        const errorText = await response.text();
                        console.error('❌ Rename failed:', errorText);
                        toast({
                          title: 'Failed to rename file',
                          description: `Failed to rename file: ${errorText}`,
                          variant: 'destructive',
                        });
                      }
                    } catch (error) {
                      console.error('❌ Error renaming file:', error);
                      toast({
                        title: 'Error renaming file',
                        description: 'Error renaming file. Please try again.',
                        variant: 'destructive',
                      });
                    }
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Update
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Enter a custom filename to rename your saved clustering results
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ClusteringInputFiles;
