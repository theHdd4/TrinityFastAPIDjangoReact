import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { VALIDATE_API } from '@/lib/api';
import { DataUploadSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Props {
  onFileUpload: (files: File[]) => void;
  uploadedFiles: File[];
  settings: DataUploadSettings;
  atomId: string;
}

const FileUploadInterface: React.FC<Props> = ({ onFileUpload, uploadedFiles }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ status?: string; message?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    onFileUpload(files);
  };

  const handleValidate = async () => {
    if (uploadedFiles.length === 0) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('validator_atom_id', 'demo-validator');
      uploadedFiles.forEach(f => form.append('files', f));
      form.append('file_keys', JSON.stringify(['data']));
      const res = await fetch(`${VALIDATE_API}/create_new`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) throw new Error('Validation request failed');
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-2">
        <div className="font-semibold">Upload Your Data</div>
        <input
          type="file"
          accept=".csv,.xlsx"
          hidden
          multiple
          ref={fileInputRef}
          onChange={handleSelect}
        />
        <Button onClick={() => fileInputRef.current?.click()} className="w-full">
          {uploadedFiles.length > 0 ? 'Replace Files' : 'Upload CSV/XLSX'}
        </Button>
        {uploadedFiles.length > 0 && (
          <div className="mt-1 space-y-1">
            {uploadedFiles.map(f => (
              <div key={f.name} className="p-2 border rounded text-xs bg-white">
                {f.name}
              </div>
            ))}
          </div>
        )}
        <Button variant="outline" disabled={uploading || uploadedFiles.length === 0} onClick={handleValidate} className="w-full">
          Validate Data
        </Button>
      </Card>
      {result && (
        <div className="space-y-1 text-sm">
          <div className="font-semibold">{result.status ?? 'success'}</div>
          <div>{result.message}</div>
        </div>
      )}
      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
};

export default FileUploadInterface;
