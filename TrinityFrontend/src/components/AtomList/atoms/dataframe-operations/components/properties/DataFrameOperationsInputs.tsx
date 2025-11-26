import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VALIDATE_API } from '@/lib/api';

interface Frame { object_name: string; arrow_name: string }

const DataFrameOperationsInputs = ({ data, settings, selectedFile, onFileSelect }: any) => {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [internalSelectedFile, setInternalSelectedFile] = useState<string>(selectedFile || '');

  // 🔧 CRITICAL: Fetch frames and re-match selectedFile after frames are loaded
  useEffect(() => {
    const fetchFrames = async () => {
      try {
        const response = await fetch(`${VALIDATE_API}/list_saved_dataframes`);
        const data = await response.json();
        const fetchedFrames = Array.isArray(data.files)
          ? data.files
              .filter((f: any) => !!f.arrow_name)
              .map((f: any) => ({
                object_name: f.object_name,
                arrow_name: f.arrow_name,
              }))
          : [];
        setFrames(fetchedFrames);
        console.log('🔧 [Inputs] Fetched frames for dropdown:', fetchedFrames.length, 'files');
        
        // 🔧 CRITICAL: After fetching frames, re-match selectedFile if it exists
        // This ensures the dropdown shows the correct selection after frames are loaded
        if (selectedFile && fetchedFrames.length > 0) {
          const matchingFrame = fetchedFrames.find((f: Frame) => {
            // Try exact match first
            if (f.object_name === selectedFile) return true;
            // Try matching by basename (filename without path)
            const selectedFileBasename = selectedFile.split('/').pop()?.replace(/\.arrow$/, '');
            const frameBasename = f.object_name.split('/').pop()?.replace(/\.arrow$/, '');
            if (selectedFileBasename && frameBasename && selectedFileBasename === frameBasename) return true;
            // Try matching arrow_name (full path)
            const arrowBasename = f.arrow_name.split('/').pop()?.replace(/\.arrow$/, '');
            if (selectedFileBasename && arrowBasename && selectedFileBasename === arrowBasename) return true;
            return false;
          });
          if (matchingFrame) {
            setInternalSelectedFile(matchingFrame.object_name);
            setSelectedFrame(matchingFrame);
            console.log('🔧 [Inputs] Re-matched selectedFile after frames loaded:', selectedFile, '->', matchingFrame.object_name);
          } else {
            console.warn('⚠️ [Inputs] No matching frame found for selectedFile:', selectedFile);
            console.log('   Available frames:', fetchedFrames.map(f => f.object_name));
          }
        }
      } catch (err) {
        console.error(`❌ [Inputs] Failed to fetch frames:`, err);
        setFrames([]);
      }
    };
    
    fetchFrames();
    // 🔧 Refresh frames periodically to catch newly added files
    const interval = setInterval(fetchFrames, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [selectedFile]);

  // 🔧 CRITICAL: Watch for changes in selectedFile prop and update internal state
  useEffect(() => {
    if (selectedFile) {
      // Try to match selectedFile to object_name in frames list
      const matchingFrame = frames.find(f => {
        // Try exact match first
        if (f.object_name === selectedFile) {
          return true;
        }
        // Try matching by basename (filename without path)
        const selectedFileBasename = selectedFile.split('/').pop()?.replace(/\.arrow$/, '');
        const frameBasename = f.object_name.split('/').pop()?.replace(/\.arrow$/, '');
        if (selectedFileBasename && frameBasename && selectedFileBasename === frameBasename) {
          return true;
        }
        // Try matching arrow_name (full path)
        const arrowBasename = f.arrow_name.split('/').pop()?.replace(/\.arrow$/, '');
        if (selectedFileBasename && arrowBasename && selectedFileBasename === arrowBasename) {
          return true;
        }
        return false;
      });
      
      if (matchingFrame) {
        setInternalSelectedFile(matchingFrame.object_name);
        setSelectedFrame(matchingFrame);
        console.log('✅ [Inputs] Matched selectedFile to frame:', selectedFile, '->', matchingFrame.object_name);
      } else if (frames.length > 0) {
        // If frames are loaded but no match found, log warning
        console.warn('⚠️ [Inputs] No matching frame found for selectedFile:', selectedFile);
        console.log('   Available frames:', frames.map(f => f.object_name));
      }
    } else {
      setInternalSelectedFile('');
      setSelectedFrame(null);
    }
  }, [selectedFile, frames]);

  const handleFileChange = (val: string) => {
    setError(null);
    const fileId = val;
    const frame = frames.find(f => f.object_name === fileId) || null;
    setSelectedFrame(frame);
    setInternalSelectedFile(fileId);
    if (!fileId || !frame) {
      setError('Please select a valid file.');
      setSelectedFrame(null);
      setInternalSelectedFile('');
      return;
    }
    onFileSelect(fileId);
  };

  return (
    <div className="space-y-4 p-2">
      <Card className="p-4 space-y-3">
        <label className="text-sm font-medium text-gray-700 block">Data Source</label>
        <Select value={internalSelectedFile} onValueChange={handleFileChange}>
          <SelectTrigger className="bg-white border-gray-300">
            <SelectValue placeholder="Choose a saved dataframe..." />
          </SelectTrigger>
          <SelectContent>
            {(Array.isArray(frames) ? frames : []).map(f => (
              <SelectItem key={f.object_name} value={f.object_name}>
                {f.arrow_name.split('/').pop()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <div className="text-red-600 text-xs p-2">{error}</div>}
      </Card>
    </div>
  );
};

export default DataFrameOperationsInputs; 

