import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { VALIDATE_API } from '@/lib/api';

const ATOMS = [
  'Data Upload',
  'Base Price Detection',
  'Comment',
  'Atom #',
  'Atom #',
  'Feature Overview',
  'Promo Price Estimation'
];

const STEPS = [
  'Pre-Process',
  'Explore',
  'Engineer',
  'Build',
  'Evaluate',
  'Plan',
  'Report'
];

const SUB_STEPS = [
  'Data Upload',
  'Feature Overview',
  'Base Price Detection',
  'Promo Price Estimation'
];

const DataUploadPage: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ status?: string; message?: string } | null>(null);
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
    <div className="grid md:grid-cols-[220px_1fr] h-screen overflow-hidden bg-background">
      {/* Left palette */}
      <div className="border-r border-muted p-4 space-y-2 overflow-y-auto hidden md:block">
        {ATOMS.map((atom) => (
          <div
            key={atom}
            className="h-10 flex items-center justify-center bg-muted text-sm font-semibold rounded-md cursor-grab"
          >
            {atom}
          </div>
        ))}
        <div className="my-4 border-t" />
        <div className="text-xs font-semibold">Select a File for Analysis</div>
        <div className="mt-1 p-2 border rounded bg-white text-xs whitespace-nowrap overflow-x-auto">
          {fileName ?? '––'}
        </div>
      </div>

      {/* Main content */}
      <div className="p-4 md:p-8 overflow-y-auto">
        <div className="flex flex-wrap gap-2 mb-4">
          {STEPS.map((step) => (
            <span
              key={step}
              className={`px-2 py-1 text-xs font-semibold rounded border ${step === 'Pre-Process' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
            >
              {step}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {SUB_STEPS.map((sub) => (
            <span
              key={sub}
              className={`px-2 py-1 text-xs rounded border ${sub === 'Data Upload' ? 'bg-secondary text-secondary-foreground' : 'bg-background'}`}
            >
              {sub}
            </span>
          ))}
        </div>

        <Card className="max-w-lg p-4 space-y-2">
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
          <div className="mt-8 space-y-1 text-sm">
            <div className="font-semibold">{result.status ?? 'success'}</div>
            <div>{result.message}</div>
          </div>
        )}
        {error && (
          <div className="mt-4 text-sm text-red-600">{error}</div>
        )}

        {fileName && (
          <div className="mt-8">
            <Button variant="outline" onClick={() => setShowTable(true)} className="mb-2">
              Data Overview
            </Button>
            {showTable && (
              <div>
                <div className="font-semibold mb-2">Data Overview</div>
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
              </div>
            )}
          </div>
        )}

        {fileName && (
          <div className="mt-8 flex justify-end">
            <Button>
              Proceed to Feature Overview
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataUploadPage;
