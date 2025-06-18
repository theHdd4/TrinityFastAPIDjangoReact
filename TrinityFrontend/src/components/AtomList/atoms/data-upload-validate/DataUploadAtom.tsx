import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { VALIDATE_API } from '@/lib/api';



const DataUploadAtom: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    status?: string;
    message?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setFileName(f.name);
    }
  };

  const handleValidate = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('validator_atom_id', 'demo-validator');
      form.append('files', file);
      form.append('file_keys', JSON.stringify(['data']));

      const res = await fetch(`${VALIDATE_API}/create_new`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        throw new Error('Validation request failed');
      }
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
          ref={fileInputRef}
          onChange={handleFileSelect}
        />
        <Button onClick={() => fileInputRef.current?.click()} className="w-full">
          {fileName ? 'Replace File' : 'Upload a CSV/XLSX'}
        </Button>
        {fileName && (
          <div className="mt-1 p-2 border rounded text-xs bg-white">{fileName}</div>
        )}
        <Button
          variant="outline"
          disabled={!file || uploading}
          onClick={handleValidate}
          className="w-full"
        >
          Validate Data
        </Button>
      </Card>

      {result && (
        <div className="space-y-1 text-sm">
          <div className="font-semibold">{result.status ?? 'success'}</div>
          <div>{result.message}</div>
        </div>
      )}
      {error && (
        <div className="text-sm text-red-600">{error}</div>
      )}

      {fileName && (
        <div className="space-y-2">
          <Button variant="outline" onClick={() => setShowTable(true)} className="mb-2">
            Data Overview
          </Button>
          {showTable && (
            <div className="overflow-auto">
              <table className="min-w-[720px] text-sm border">
                <thead>
                  <tr>
                    {Array.from({ length: 9 }).map((_, i) => (
                      <th key={i} className="border px-2 py-1 text-center font-semibold">
                        Column {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 8 }).map((_, r) => (
                    <tr key={r}>
                      {Array.from({ length: 9 }).map((__, c) => (
                        <td key={c} className="border px-2 py-1" />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DataUploadAtom;
