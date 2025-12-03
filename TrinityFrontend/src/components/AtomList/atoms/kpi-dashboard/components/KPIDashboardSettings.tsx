import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { VALIDATE_API } from '@/lib/api';
import type { KPIDashboardData, KPIDashboardSettings as KPISettings } from '../KPIDashboardAtom';

interface KPIDashboardSettingsProps {
  settings: KPISettings;
  onSettingsChange: (settings: Partial<KPISettings>) => void;
  onDataUpload: (data: KPIDashboardData) => void;
  availableColumns: string[];
}

interface Frame {
  object_name: string;
  arrow_name?: string;
  csv_name?: string;
}

const KPIDashboardSettings: React.FC<KPIDashboardSettingsProps> = ({
  settings,
  onSettingsChange,
  onDataUpload,
  availableColumns
}) => {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available dataframes from database
  useEffect(() => {
    fetch(`${VALIDATE_API}/list_saved_dataframes`)
      .then(r => r.json())
      .then(d => {
        // Filter to only show Arrow files
        const allFiles = Array.isArray(d.files) ? d.files : [];
        const arrowFiles = allFiles.filter(f => 
          f.object_name && f.object_name.endsWith('.arrow')
        );
        setFrames(arrowFiles);
      })
      .catch((err) => {
        console.error('Failed to fetch dataframes:', err);
        setFrames([]);
      });
  }, []);

  // Load dataframe data when file is selected
  const handleFileSelect = async (fileId: string) => {
    setSelectedFile(fileId);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${VALIDATE_API}/load_dataframe_by_key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: fileId })
      });

      if (!response.ok) {
        throw new Error('Failed to load dataframe');
      }

      const data = await response.json();
      const frame = frames.find(f => f.object_name === fileId);
      
      onDataUpload({
        headers: data.headers || [],
        rows: data.rows || [],
        fileName: frame?.arrow_name?.split('/').pop() || fileId,
        metrics: []
      });

      setLoading(false);
    } catch (err) {
      console.error('Error loading dataframe:', err);
      setError('Failed to load dataframe');
      setLoading(false);
    }
  };

  const toggleMetricColumn = (column: string) => {
    const current = settings.metricColumns || [];
    const updated = current.includes(column)
      ? current.filter(c => c !== column)
      : [...current, column];
    onSettingsChange({ metricColumns: updated });
  };

  return (
    <div className="space-y-6 p-2">
      {/* Select Dataframe from Database */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Data Source</Label>
        <Card className="p-4 space-y-3">
          <Select value={selectedFile} onValueChange={handleFileSelect}>
            <SelectTrigger className="w-full bg-white border-gray-300">
              <SelectValue placeholder="Select a saved dataframe..." />
            </SelectTrigger>
            <SelectContent>
              {frames.length === 0 ? (
                <SelectItem value="no-data" disabled>
                  No dataframes available
                </SelectItem>
              ) : (
                frames.map(f => (
                  <SelectItem key={f.object_name} value={f.object_name}>
                    {f.arrow_name?.split('/').pop() || f.csv_name || f.object_name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {loading && (
            <p className="text-xs text-blue-600">Loading dataframe...</p>
          )}
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
        </Card>
        <p className="text-xs text-muted-foreground">
          Select a dataframe from the database to use as data source
        </p>
      </div>

      {/* Dashboard Title */}
      <div className="space-y-2">
        <Label htmlFor="title" className="text-sm font-medium">
          Dashboard Title
        </Label>
        <Input
          id="title"
          value={settings.title}
          onChange={(e) => onSettingsChange({ title: e.target.value })}
          placeholder="Enter dashboard title"
          className="w-full"
        />
      </div>

      {/* Select Metric Columns */}
      {availableColumns.length > 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Select Metrics to Display</Label>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
            {availableColumns.map((column) => (
              <div
                key={column}
                className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  id={`metric-${column}`}
                  checked={settings.metricColumns.includes(column)}
                  onCheckedChange={() => toggleMetricColumn(column)}
                />
                <label
                  htmlFor={`metric-${column}`}
                  className="text-sm cursor-pointer flex-1"
                >
                  {column}
                </label>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Selected: {settings.metricColumns.length} metrics
          </p>
        </div>
      )}

      {/* Insights */}
      <div className="space-y-2">
        <Label htmlFor="insights" className="text-sm font-medium">
          Key Insights
        </Label>
        <Textarea
          id="insights"
          value={settings.insights}
          onChange={(e) => onSettingsChange({ insights: e.target.value })}
          placeholder="Add key insights and observations..."
          className="min-h-32 resize-y"
        />
        <p className="text-xs text-muted-foreground">
          Add textual insights to provide context to your KPIs
        </p>
      </div>
    </div>
  );
};

export default KPIDashboardSettings;
