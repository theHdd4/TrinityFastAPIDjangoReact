import React, { useCallback, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Info, Check, AlertCircle } from 'lucide-react';
import { VALIDATE_API } from '@/lib/api';

interface FileUploadInterfaceProps {
  onFileUpload: (files: File[]) => void;
  uploadedFiles: File[];
}

const FileUploadInterface: React.FC<FileUploadInterfaceProps> = ({
  onFileUpload,
  uploadedFiles,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ status?: string; message?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      onFileUpload(files);
    },
    [onFileUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      onFileUpload(files);
    }
  };

  const handleValidate = async () => {
    if (uploadedFiles.length === 0) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('validator_atom_id', 'demo-validator');
      uploadedFiles.forEach((f) => form.append('files', f));
      form.append('file_keys', JSON.stringify(['data']));
      const res = await fetch(`${VALIDATE_API}/validate`, {
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

  const requiredFiles = [
    { name: 'Sales Data', filename: 'DQ_Market_Brand_Category', required: true, status: 'pending' },
    { name: 'Margin File', filename: 'Margin_lvl_##', required: true, status: 'pending' },
    { name: 'Product Data', filename: 'Product_Master', required: true, status: 'pending' },
    { name: 'Customer Data', filename: 'Customer_Base', required: false, status: 'pending' },
    { name: 'Promotion Data', filename: 'Promo_Calendar', required: false, status: 'pending' },
    { name: 'Market Data', filename: 'Market_Share', required: false, status: 'pending' },
  ];

  const getStatusIcon = (status: string, required: boolean) => {
    if (status === 'uploaded') return <Check className="w-4 h-4 text-green-500" />;
    if (required) return <AlertCircle className="w-4 h-4 text-orange-500" />;
    return <Info className="w-4 h-4 text-gray-400" />;
  };

  return (
    <div className="flex h-full space-x-6 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 pr-2">
      {/* Upload Area */}
      <div className="flex-1">
        <Card className="h-full flex flex-col shadow-sm border-0 bg-gradient-to-br from-gray-50 to-white">
          <div className="p-6 border-b border-gray-100 bg-white rounded-t-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Upload Your Data Files</h3>
            <p className="text-sm text-gray-600">Drag and drop files or browse to upload your data</p>
          </div>

          <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300">
            <div
              className={`w-full max-w-lg text-center transition-all duration-300 ${
                isDragOver ? 'transform scale-105' : 'transform scale-100'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div
                className={`border-2 border-dashed rounded-2xl p-8 transition-all duration-300 ${
                  isDragOver
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-300 bg-white hover:border-blue-300 hover:bg-blue-50/50'
                }`}
              >
                <div className="mb-6">
                  <div
                    className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center transition-all duration-300 ${
                      isDragOver ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    <Upload className="w-8 h-8" />
                  </div>
                  <h4 className="text-xl font-semibold text-gray-900 mb-2">
                    {isDragOver ? 'Drop files here' : 'Drag and Drop your Files'}
                  </h4>
                  <p className="text-gray-600 mb-6">Supports CSV, Excel, JSON files up to 50MB</p>

                  <div className="flex items-center justify-center space-x-4">
                    <div className="h-px bg-gray-300 flex-1"></div>
                    <span className="text-gray-500 text-sm">OR</span>
                    <div className="h-px bg-gray-300 flex-1"></div>
                  </div>
                </div>

                <input
                  type="file"
                  multiple
                  accept=".csv,.xlsx,.xls,.json"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                  ref={fileInputRef}
                />
                <label htmlFor="file-upload">
                  <Button
                    asChild
                    className="cursor-pointer bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg px-8 py-3"
                  >
                    <span>Browse Files</span>
                  </Button>
                </label>
              </div>

              {uploadedFiles.length > 0 && (
                <div className="mt-8">
                  <h5 className="font-semibold text-gray-900 mb-4 text-left">Uploaded Files:</h5>
                  <div className="space-y-3">
                    {uploadedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg"
                      >
                        <div className="flex items-center space-x-3">
                          <Check className="w-5 h-5 text-green-500" />
                          <div>
                            <span className="text-sm font-medium text-gray-900">{file.name}</span>
                            <p className="text-xs text-gray-600">
                              {(file.size / 1024 / 1024).toFixed(2)} MB • Uploaded successfully
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                          Ready
                        </Badge>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4">
                    <Button
                      className="w-full bg-blue-600 text-white"
                      disabled={uploading}
                      onClick={handleValidate}
                    >
                      Validate Files
                    </Button>
                  </div>
                  {result && (
                    <p className="text-sm text-green-700 mt-2">{result.message}</p>
                  )}
                  {error && (
                    <p className="text-sm text-red-600 mt-2">{error}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Required Files Panel */}
      <div className="w-80">
        <Card className="h-full shadow-sm border-0 bg-white">
          <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white rounded-t-lg">
            <h4 className="font-semibold text-gray-900 flex items-center space-x-2">
              <FileText className="w-4 h-4 text-blue-500" />
              <span>Required Files</span>
            </h4>
            <p className="text-xs text-gray-600 mt-1">Upload these files for complete data validation</p>
          </div>

          <div className="p-4 space-y-3 overflow-y-auto h-[calc(100%-80px)] scrollbar-thin scrollbar-thumb-gray-300">
            {requiredFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all duration-200"
              >
                <div className="flex-shrink-0">{getStatusIcon(file.status, file.required)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    {file.required && (
                      <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                        Required
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 truncate mt-1">Format: {file.filename}</p>
                </div>
              </div>
            ))}

            <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start space-x-2">
                <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-blue-900">File Requirements</p>
                  <p className="text-xs text-blue-700 mt-1">
                    Files should be in CSV or Excel format with proper column headers. Large files will be processed automatically.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default FileUploadInterface;
