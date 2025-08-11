import React, { useState } from 'react';
import { Calendar, X, Upload, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { CorrelationSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import { processCSVFile, calculateCorrelationFromData } from '../utils/csvProcessor';

interface CorrelationSettingsProps {
  data: CorrelationSettings;
  onDataChange: (newData: Partial<CorrelationSettings>) => void;
}

const CorrelationSettings: React.FC<CorrelationSettingsProps> = ({ data, onDataChange }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);

  const handleSettingsChange = (key: string, value: any) => {
    onDataChange({
      settings: {
        ...data.settings,
        [key]: value
      }
    });
  };

  const handleIdentifierChange = (key: string, value: string) => {
    onDataChange({
      identifiers: {
        ...data.identifiers,
        [key]: value
      }
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setProcessingError('Please upload a CSV file');
      return;
    }

    setIsProcessing(true);
    setProcessingError(null);

    try {
      // Process the CSV file
      const fileData = await processCSVFile(file);
      
      if (fileData.numericColumns.length < 2) {
        throw new Error('CSV file must contain at least 2 numeric columns for correlation analysis');
      }

      // Calculate correlations from the file data
      const correlationMethod = data.settings.correlationMethod.toLowerCase() as 'pearson' | 'spearman';
      const correlationResult = calculateCorrelationFromData(fileData, correlationMethod);

      // Update the store with processed data
      onDataChange({
        fileData,
        isUsingFileData: true,
        variables: correlationResult.variables,
        correlationMatrix: correlationResult.correlationMatrix,
        timeSeriesData: correlationResult.timeSeriesData,
        selectedVar1: correlationResult.variables[0],
        selectedVar2: correlationResult.variables[1] || correlationResult.variables[0],
        // Ensure identifiers object exists
        identifiers: data.identifiers || {
          identifier3: 'All',
          identifier4: 'All',
          identifier6: 'All',
          identifier7: 'All',
          identifier15: 'All'
        },
        settings: {
          ...data.settings,
          uploadedFile: file.name,
          dataSource: 'CSV'
        }
      });

      console.log('File processed successfully:', {
        fileName: file.name,
        numericColumns: fileData.numericColumns,
        rows: fileData.rawData.length
      });

    } catch (error) {
      console.error('Error processing file:', error);
      setProcessingError(error.message || 'Failed to process the uploaded file');
    } finally {
      setIsProcessing(false);
      // Reset the input
      event.target.value = '';
    }
  };

  const handleCorrelationMethodChange = (method: string) => {
    handleSettingsChange('correlationMethod', method);
    
    // If we have file data, recalculate correlations with new method
    if (data.isUsingFileData && data.fileData?.isProcessed) {
      try {
        const correlationMethod = method.toLowerCase() as 'pearson' | 'spearman';
        const correlationResult = calculateCorrelationFromData(data.fileData, correlationMethod);
        
        onDataChange({
          correlationMatrix: correlationResult.correlationMatrix,
          timeSeriesData: correlationResult.timeSeriesData,
          settings: {
            ...data.settings,
            correlationMethod: method
          }
        });
      } catch (error) {
        console.error('Error recalculating correlations:', error);
        setProcessingError('Failed to recalculate correlations with new method');
      }
    }
  };

  const handleApplySettings = () => {
    if (data.isUsingFileData && data.fileData?.isProcessed) {
      try {
        const correlationMethod = data.settings.correlationMethod.toLowerCase() as 'pearson' | 'spearman';
        const correlationResult = calculateCorrelationFromData(data.fileData, correlationMethod);
        
        onDataChange({
          correlationMatrix: correlationResult.correlationMatrix,
          timeSeriesData: correlationResult.timeSeriesData,
          variables: correlationResult.variables,
          selectedVar1: correlationResult.variables[0],
          selectedVar2: correlationResult.variables[1] || correlationResult.variables[0],
        });
        
        setProcessingError(null);
      } catch (error) {
        console.error('Error applying settings:', error);
        setProcessingError('Failed to apply settings');
      }
    }
  };

  const handleReset = () => {
    if (data.isUsingFileData) {
      onDataChange({
        isUsingFileData: false,
        fileData: undefined
      });
    }
    setProcessingError(null);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-6 bg-background text-foreground">
        {/* File Upload Section */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Data Input</h3>
          
          {/* Error Alert */}
          {processingError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{processingError}</AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-3">
            {/* Upload Area */}
            <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium mb-1">Upload your CSV data file</p>
              <p className="text-xs text-muted-foreground mb-3">Upload a CSV file with numeric columns for correlation analysis</p>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                id="correlation-file-upload"
                disabled={isProcessing}
              />
              <label htmlFor="correlation-file-upload">
                <Button asChild variant="outline" size="sm" className="cursor-pointer" disabled={isProcessing}>
                  <span>
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Choose CSV File'
                    )}
                  </span>
                </Button>
              </label>
            </div>
            
            {/* Current File Status */}
            {data.fileData?.isProcessed ? (
              <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-green-900">{data.fileData.fileName}</span>
                  <div className="text-xs text-green-700">
                    {data.fileData.rawData.length} rows, {data.fileData.numericColumns.length} numeric columns
                  </div>
                </div>
                <Badge variant="secondary" className="bg-green-100 text-green-800">Active</Badge>
              </div>
            ) : data.settings.uploadedFile ? (
              <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{data.settings.uploadedFile}</span>
                <Badge variant="secondary" className="ml-auto">Mock Data</Badge>
              </div>
            ) : null}

            {/* Switch between file and mock data */}
            {data.fileData?.isProcessed && (
              <div className="flex gap-2">
                <Button
                  variant={data.isUsingFileData ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => onDataChange({ isUsingFileData: true })}
                >
                  Use Uploaded Data
                </Button>
                <Button
                  variant={!data.isUsingFileData ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => onDataChange({ isUsingFileData: false, fileData: undefined })}
                >
                  Use Mock Data
                </Button>
              </div>
            )}

            {/* Show column information for uploaded file */}
            {data.fileData?.isProcessed && data.isUsingFileData && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="text-sm font-medium text-blue-900 mb-2">Available Columns</h4>
                <div className="space-y-1">
                  <div>
                    <span className="text-xs font-medium text-blue-800">Numeric ({data.fileData.numericColumns.length}): </span>
                    <span className="text-xs text-blue-700">
                      {data.fileData.numericColumns.join(', ')}
                    </span>
                  </div>
                  {data.fileData.dateColumns.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-blue-800">Date ({data.fileData.dateColumns.length}): </span>
                      <span className="text-xs text-blue-700">
                        {data.fileData.dateColumns.join(', ')}
                      </span>
                    </div>
                  )}
                  {data.fileData.categoricalColumns.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-blue-800">Categorical ({data.fileData.categoricalColumns.length}): </span>
                      <span className="text-xs text-blue-700">
                        {data.fileData.categoricalColumns.slice(0, 3).join(', ')}
                        {data.fileData.categoricalColumns.length > 3 ? ` +${data.fileData.categoricalColumns.length - 3} more` : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Select Data Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Select Data</h3>
        <div className="space-y-2">
          <Select 
            value={data.settings.selectData} 
            onValueChange={(value) => handleSettingsChange('selectData', value)}
          >
            <SelectTrigger className="w-full bg-background border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background border-border z-50">
              <SelectItem value="Single Selection">Single Selection</SelectItem>
              <SelectItem value="Multi Selection">Multi Selection</SelectItem>
            </SelectContent>
          </Select>
          
          <Select 
            value={data.settings.dataset} 
            onValueChange={(value) => handleSettingsChange('dataset', value)}
          >
            <SelectTrigger className="w-full bg-background border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background border-border z-50">
              <SelectItem value="Sales_Data">Sales_Data</SelectItem>
              <SelectItem value="Marketing_Data">Marketing_Data</SelectItem>
              <SelectItem value="Customer_Data">Customer_Data</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Date Filter Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Date Filter</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="fromDate" className="text-xs text-muted-foreground">From</Label>
            <div className="relative">
              <Input
                id="fromDate"
                value={data.settings.dateFrom}
                onChange={(e) => handleSettingsChange('dateFrom', e.target.value)}
                className="pr-8 text-xs bg-background border-border"
                placeholder="01 JUL 2020"
              />
              <Calendar className="absolute right-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            </div>
          </div>
          
          <div className="space-y-1">
            <Label htmlFor="toDate" className="text-xs text-muted-foreground">To</Label>
            <div className="relative">
              <Input
                id="toDate"
                value={data.settings.dateTo}
                onChange={(e) => handleSettingsChange('dateTo', e.target.value)}
                className="pr-8 text-xs bg-background border-border"
                placeholder="30 MAR 2025"
              />
              <Calendar className="absolute right-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            </div>
          </div>
        </div>
        
        <div className="text-xs text-muted-foreground">
          Data available<br />
          <span className="font-medium">From:</span> 01-Jan-2018 to: 30-Mar-2025
        </div>
      </div>

      {/* Date and Time Aggregation */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Date and Time Aggregation</h3>
        <div className="space-y-2">
          <div className="flex gap-1">
            {['Yearly', 'Quarterly', 'Monthly', 'Weekly'].map((period) => (
              <Button
                key={period}
                variant={data.settings.aggregationLevel === period ? "default" : "outline"}
                size="sm"
                className="text-xs h-6 px-2"
                onClick={() => handleSettingsChange('aggregationLevel', period)}
              >
                {period}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Select Filter */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Select Filter</h3>
        <div className="space-y-2">
          <Select 
            value={data.settings.selectFilter} 
            onValueChange={(value) => handleSettingsChange('selectFilter', value)}
          >
            <SelectTrigger className="w-full bg-background border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background border-border z-50">
              <SelectItem value="Multi Selection">Multi Selection</SelectItem>
              <SelectItem value="Single Selection">Single Selection</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Filter Items */}
          <div className="space-y-2">
            {Object.entries(data.identifiers || {}).map(([key, value]) => {
              const displayName = key.replace('identifier', 'Identifier ');
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground min-w-[70px]">{displayName}</span>
                  <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs">
                    <span>{value || 'All'}</span>
                    <X className="h-3 w-3 text-muted-foreground cursor-pointer" 
                       onClick={() => handleIdentifierChange(key, 'All')} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Correlation Method */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Correlation Method</h3>
        <Select 
          value={data.settings.correlationMethod} 
          onValueChange={handleCorrelationMethodChange}
        >
          <SelectTrigger className="w-full bg-background border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-background border-border z-50">
            <SelectItem value="Pearson">Pearson</SelectItem>
            <SelectItem value="Spearman">Spearman</SelectItem>
            <SelectItem value="Kendall">Kendall</SelectItem>
          </SelectContent>
        </Select>
        {data.isUsingFileData && (
          <p className="text-xs text-muted-foreground">
            Correlation matrix will be recalculated when method changes
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4">
        <Button 
          variant="default" 
          size="sm" 
          className="flex-1"
          onClick={handleApplySettings}
          disabled={isProcessing || !data.fileData?.isProcessed}
        >
          {data.isUsingFileData ? 'Recalculate' : 'Apply Settings'}
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          className="flex-1"
          onClick={handleReset}
        >
          Reset
        </Button>
        </div>
      </div>
    </div>
  );
};

export default CorrelationSettings;