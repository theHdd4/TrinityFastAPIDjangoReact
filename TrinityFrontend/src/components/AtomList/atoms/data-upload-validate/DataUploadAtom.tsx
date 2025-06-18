import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { VALIDATE_API } from '@/lib/api';

type ValidationStatus = 'success' | 'warning' | 'error';

interface ValidationItem {
  id: number;
  label: string;
  status: ValidationStatus;
}

const VALIDATIONS: ValidationItem[] = [
  { id: 1, label: 'Validation 1', status: 'success' },
  { id: 2, label: 'Validation 2', status: 'success' },
  { id: 3, label: 'Validation 3', status: 'success' },
  { id: 4, label: 'Validation 4', status: 'success' },
  { id: 5, label: 'Validation 5', status: 'warning' },
  { id: 6, label: 'Validation 6', status: 'warning' },
  { id: 7, label: 'Validation 7', status: 'warning' },
  { id: 8, label: 'Validation 8', status: 'error' },
  { id: 9, label: 'Validation 9', status: 'error' }
];

const DataUploadAtom: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [uploading, setUploading] = useState(false);

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
    try {
      const form = new FormData();
      form.append('validator_atom_id', 'demo-validator');
      form.append('files', file);
      form.append('file_keys', JSON.stringify(['data']));

      await fetch(`${VALIDATE_API}/create_new`, {
        method: 'POST',
        body: form
      });
    } catch {
      /* ignore errors in demo */
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

      {fileName && (
        <>
          <div className="font-semibold">Validation Report</div>
          <div className="flex flex-wrap gap-2">
            {VALIDATIONS.map(({ id, label, status }) => (
              <div key={id} className="flex items-center gap-1 border rounded px-2 py-1 text-xs">
                <span
                  className={
                    status === 'success'
                      ? 'text-green-600'
                      : status === 'warning'
                      ? 'text-yellow-600'
                      : 'text-red-600'
                  }
                >
                  ●
                </span>
                <span>{label}</span>
                <span className="opacity-70">
                  {status === 'success' ? '*Successful' : status === 'warning' ? '*Autofixed' : '*Unsuccessful'}
                </span>
              </div>
            ))}
          </div>
          <div className="text-xs mt-2">
            <span className="font-bold">Note :</span> *Include the Mandatory Columns
          </div>
        </>
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
