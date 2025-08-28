import React, { useRef, useState } from 'react';
import axios from 'axios';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Upload, Settings, Filter, Eye, Palette } from 'lucide-react';
import { DataFrameData, DataFrameSettings } from '../DataFrameOperationsAtom';
import { DATAFRAME_OPERATIONS_V1_API } from '@/lib/api';

interface DataFrameOperationsSettingsProps {
  settings: DataFrameSettings;
  onSettingsChange: (settings: Partial<DataFrameSettings>) => void;
  onDataUpload: (data: DataFrameData, fileId: string) => void;
  availableColumns: string[];
  data: DataFrameData | null;
}

const DataFrameOperationsSettings: React.FC<DataFrameOperationsSettingsProps> = ({
  settings,
  onSettingsChange,
  onDataUpload,
  availableColumns,
  data
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${DATAFRAME_OPERATIONS_V1_API}/upload/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const result = res.data;
      onDataUpload({
        headers: result.headers,
        rows: result.rows,
        fileName: file.name,
        columnTypes: result.column_types,
        pinnedColumns: [],
        frozenColumns: 0,
        cellColors: {},
      }, result.file_id);
      // Optionally store fileId in parent or context if needed for saving
    } catch (err: any) {
      setUploadError(err?.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleFilterChange = (column: string, filterValue: string) => {
    const newFilters = { ...settings.filters };
    if (filterValue) {
      newFilters[column] = { value: filterValue, type: 'text' };
    } else {
      delete newFilters[column];
    }
    onSettingsChange({ filters: newFilters });
  };

  return (
    <div className="space-y-4">
      {/* File Upload */}
      <Card className="border border-border shadow-sm">
        <div className="p-4">
          <h4 className="font-medium text-foreground mb-4 flex items-center">
            <Upload className="w-4 h-4 text-primary mr-2" />
            Data Source
          </h4>
          {uploading && <div className="text-primary text-sm mb-2">Uploading...</div>}
          {uploadError && <div className="text-destructive text-sm mb-2">{uploadError}</div>}
          {data ? (
            <div className="space-y-3">
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Upload className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">{data.fileName}</span>
                  </div>
                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">Active</Badge>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                Upload New File
              </Button>
            </div>
          ) : (
            <Button 
              className="w-full" 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload File
            </Button>
          )}
        </div>
      </Card>

      {/* Display Settings */}
      <Card className="border border-border shadow-sm">
        <div className="p-4">
          <h4 className="font-medium text-foreground mb-4 flex items-center">
            <Settings className="w-4 h-4 text-muted-foreground mr-2" />
            Display Settings
          </h4>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="rowsPerPage" className="text-sm">Rows per page</Label>
              <Select 
                value={settings.rowsPerPage.toString()} 
                onValueChange={(value) => onSettingsChange({ rowsPerPage: parseInt(value) })}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="15">15</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="showRowNumbers" className="text-sm">Show row numbers</Label>
              <Switch
                id="showRowNumbers"
                checked={settings.showRowNumbers}
                onCheckedChange={(checked) => onSettingsChange({ showRowNumbers: checked })}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="enableEditing" className="text-sm">Enable editing</Label>
              <Switch
                id="enableEditing"
                checked={settings.enableEditing}
                onCheckedChange={(checked) => onSettingsChange({ enableEditing: checked })}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Column Filters */}
      {data && (
        <Card className="border border-border shadow-sm">
          <div className="p-4">
            <h4 className="font-medium text-foreground mb-4 flex items-center">
              <Filter className="w-4 h-4 text-primary mr-2" />
              Column Filters
            </h4>
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {availableColumns.map((column) => (
                <div key={column}>
                  <Label className="text-xs text-muted-foreground mb-1 block">{column}</Label>
                  <Input
                    placeholder={`Filter ${column}...`}
                    value={settings.filters[column]?.value || ''}
                    onChange={(e) => handleFilterChange(column, e.target.value)}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Column Management */}
      {data && (
        <Card className="border border-border shadow-sm">
          <div className="p-4">
            <h4 className="font-medium text-foreground mb-4 flex items-center">
              <Eye className="w-4 h-4 text-primary mr-2" />
              Column Visibility
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {availableColumns.map((column) => (
                <div key={column} className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{column}</span>
                  <div className="flex items-center space-x-2">
                    <Badge 
                      variant={data.columnTypes[column] === 'number' ? 'default' : 'outline'}
                      className="text-xs"
                    >
                      {data.columnTypes[column]}
                    </Badge>
                    <Switch
                      checked={settings.selectedColumns.includes(column)}
                      onCheckedChange={(checked) => {
                        const newColumns = checked 
                          ? [...settings.selectedColumns, column]
                          : settings.selectedColumns.filter(c => c !== column);
                        onSettingsChange({ selectedColumns: newColumns });
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handleFileUpload}
        className="hidden"
        disabled={uploading}
      />
    </div>
  );
};

export default DataFrameOperationsSettings;