import React, { useState, useRef } from 'react';
import { Upload, CheckCircle2, SlidersHorizontal, Database } from 'lucide-react';
import { useLaboratoryStore } from '../store/laboratoryStore';
import { VALIDATE_API } from '@/lib/api';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { useToast } from '@/hooks/use-toast';
import { waitForTaskResult } from '@/lib/taskQueue';
import { ActionButtonBox } from './ActionButtonBox';
import AtomSuggestion from '@/components/AtomSuggestion/AtomSuggestion';
import type { LandingScreenProps } from './types';

interface AllPrimedCardProps extends LandingScreenProps {
  cardId: string;
  onReplaceAtom: (newAtomId: string) => void;
  onUploadComplete?: () => void;
}

export const AllPrimedCard: React.FC<AllPrimedCardProps> = ({
  files,
  primedCount,
  cardId,
  onReplaceAtom,
  onUploadComplete,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const setActiveGuidedFlow = useLaboratoryStore((state) => state.setActiveGuidedFlow);
  const setAuxiliaryMenuLeftOpen = useLaboratoryStore((state) => state.setAuxiliaryMenuLeftOpen);

  const appendEnvFields = (form: FormData) => {
    const env = getActiveProjectContext();
    if (env) {
      form.append('client_id', env.CLIENT_ID || '');
      form.append('app_id', env.APP_ID || '');
      form.append('project_id', env.PROJECT_ID || '');
      form.append('client_name', env.CLIENT_NAME || '');
      form.append('app_name', env.APP_NAME || '');
      form.append('project_name', env.PROJECT_NAME || '');
    }
  };

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const sanitizedFileName = file.name.replace(/\s+/g, '_');
      const sanitizedFile = sanitizedFileName !== file.name
        ? new File([file], sanitizedFileName, { type: file.type, lastModified: file.lastModified })
        : file;

      const form = new FormData();
      form.append('file', sanitizedFile);
      appendEnvFields(form);
      
      const res = await fetch(`${VALIDATE_API}/upload-file`, {
        method: 'POST',
        body: form,
        credentials: 'include'
      });
      
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload) {
        throw new Error(payload?.detail || 'Upload failed');
      }
      
      const data = await waitForTaskResult(payload);
      const fileKey = sanitizedFileName.replace(/\.[^/.]+$/, '').toLowerCase();
      const uploadedFileInfo = {
        name: data.file_name || sanitizedFileName,
        path: data.file_path,
        size: file.size,
        fileKey: fileKey,
        processed: false,
      };
      
      // Replace landing screen with data-upload atom
      onReplaceAtom('data-upload');
      
      // Set guided flow for the new atom
      setTimeout(() => {
        setActiveGuidedFlow('data-upload-landing', 'U1', {
          uploadedFiles: [uploadedFileInfo],
          currentStage: 'U1',
        });
      }, 100);
      
      toast({ 
        title: 'File uploaded', 
        description: `${data.file_name || sanitizedFileName} is ready for processing.` 
      });
      
      onUploadComplete?.();
    } catch (err: any) {
      toast({ 
        title: 'Upload failed', 
        description: err.message, 
        variant: 'destructive' 
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const validExtensions = ['.csv', '.xlsx', '.xls', '.tsv'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a CSV, Excel, or TSV file.',
        variant: 'destructive',
      });
      return;
    }
    
    handleFileUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleViewPrimedData = () => {
    // Replace landing screen with data-validate atom to view primed data
    onReplaceAtom('data-validate');
    toast({
      title: 'View primed data',
      description: 'You can now view and analyze your primed datasets.',
    });
  };

  const handleUploadMoreData = () => {
    // Replace landing screen with data-upload atom
    onReplaceAtom('data-upload');
  };

  const handleExploreAtoms = () => {
    // Open the atom library sidebar
    setAuxiliaryMenuLeftOpen(true);
    toast({
      title: 'Atom library opened',
      description: 'Browse available atoms from the sidebar.',
    });
  };

  return (
    <div className="w-full h-full space-y-6 p-6">
        {/* Success Status - Case 3 (Scenario 3) */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
            <div>
              <h3 className="text-base font-semibold text-green-900 mb-1">
                Priming complete
              </h3>
              <p className="text-sm text-green-700">
                <span className="font-semibold">{primedCount}</span> dataset{primedCount !== 1 ? 's' : ''} ready for analysis
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">What would you like to do next?</h3>
          <ActionButtonBox
            buttons={[
              {
                label: 'View Primed Data',
                onClick: handleViewPrimedData,
                variant: 'primary',
                icon: <SlidersHorizontal className="w-4 h-4" />,
              },
              {
                label: 'Upload More Data',
                onClick: handleUploadMoreData,
                variant: 'secondary',
                icon: <Upload className="w-4 h-4" />,
              },
              {
                label: 'Explore Atoms',
                onClick: handleExploreAtoms,
                variant: 'outline',
                icon: <Database className="w-4 h-4" />,
              },
            ]}
          />
        </div>

        {/* Upload Area (Collapsible) */}
        <div
          className={`border-2 border-dashed rounded-xl text-center transition-all duration-300 p-6 cursor-pointer ${
            isDragOver 
              ? 'border-blue-400 bg-blue-50' 
              : 'border-blue-300 hover:border-blue-400 bg-blue-50/50'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="mb-2">
            <Upload className={`mx-auto w-8 h-8 text-blue-500 mb-2 ${isDragOver ? 'scale-110' : ''}`} />
            <p className="text-sm font-medium text-gray-700 mb-1">
              {isDragOver ? 'Drop files here' : 'Drag and drop files or click to upload'}
            </p>
            <p className="text-xs text-gray-500">
              Upload CSV or Excel files directly
            </p>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".csv,.xlsx,.xls,.tsv"
          onChange={(e) => handleFileSelect(e.target.files)}
        />

        {/* Search Bar */}
        <div className="mt-6">
          <AtomSuggestion
            cardId={cardId}
            isVisible={true}
            onClose={() => {}}
            onAddAtom={(atomId, atomData) => {
              // Replace landing screen with the selected atom
              onReplaceAtom(atomId);
            }}
          />
        </div>
    </div>
  );
};

