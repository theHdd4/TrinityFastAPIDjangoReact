import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileText, FileSpreadsheet } from 'lucide-react';
import { GROUPBY_API } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface GroupByExhibitionProps {
  settings: any;
  onPerformGroupBy?: () => void;
}

const GroupByExhibition: React.FC<GroupByExhibitionProps> = ({ settings, onPerformGroupBy }) => {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  
  // 🔧 CRITICAL FIX: Force re-render when AI results change
  const [refreshKey, setRefreshKey] = React.useState(0);
  
  React.useEffect(() => {
    if (settings.groupbyResults?.unsaved_data && 
        Array.isArray(settings.groupbyResults.unsaved_data) && 
        settings.groupbyResults.unsaved_data.length > 0) {
      console.log('🔄 AI results detected in GroupByExhibition, forcing refresh');
      setRefreshKey(prev => prev + 1);
    }
  }, [settings.groupbyResults?.unsaved_data]);

  // 🔧 CRITICAL FIX: Check for both file-based results and AI results
  const hasFileResults = !!settings.groupbyResults?.result_file;
  const hasAIResults = !!settings.groupbyResults?.unsaved_data && Array.isArray(settings.groupbyResults.unsaved_data) && settings.groupbyResults.unsaved_data.length > 0;
  const hasResults = hasFileResults || hasAIResults;
  
  // 🔧 DEBUG: Log what we're detecting (only when results change)
  React.useEffect(() => {
    if (hasAIResults || hasFileResults) {
      console.log('🔍 GroupByExhibition Results Detected:', {
        hasFileResults,
        hasAIResults,
        hasResults,
        unsavedDataLength: settings.groupbyResults?.unsaved_data?.length,
        resultFile: settings.groupbyResults?.result_file
      });
    }
  }, [hasAIResults, hasFileResults, hasResults]);
  
  // Use AI results if available, otherwise fallback to file results
  const resultShape = hasAIResults 
    ? [settings.groupbyResults.unsaved_data.length, Object.keys(settings.groupbyResults.unsaved_data[0] || {}).length]
    : settings.groupbyResults?.result_shape;

  const handleExport = async (type: 'csv' | 'excel') => {
    if (!hasResults) {
      toast({
        title: 'No Data Available',
        description: 'Please perform a group-by first to export results.',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (hasAIResults) {
        // 🔧 CRITICAL FIX: Export AI results directly
        const dataToExport = settings.groupbyResults.unsaved_data;
        const headers = Object.keys(dataToExport[0] || {});
        const csvContent = [
          headers.join(','),
          ...dataToExport.map(row => 
            headers.map(header => {
              const value = row[header];
              if (value === null || value === undefined || value === '') return '';
              return typeof value === 'string' ? `"${value}"` : value;
            }).join(',')
          )
        ].join('\n');

        const blob = new Blob([csvContent], { type: type === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const a = document.createElement('a');
        a.href = window.URL.createObjectURL(blob);
        a.download = type === 'csv'
          ? `groupby_ai_result_${new Date().toISOString().split('T')[0]}.csv`
          : `groupby_ai_result_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(a.href);
        document.body.removeChild(a);
        toast({ title: 'Export Successful', description: 'AI results exported successfully.' });
      } else {
        // Fallback to file-based export
        const endpoint = type === 'csv' ? 'export_csv' : 'export_excel';
        const url = `${GROUPBY_API}/${endpoint}?object_name=${encodeURIComponent(settings.groupbyResults.result_file)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Export failed: ${response.statusText}`);
        const blob = await response.blob();

        const a = document.createElement('a');
        a.href = window.URL.createObjectURL(blob);
        a.download = type === 'csv'
          ? `groupby_result_${new Date().toISOString().split('T')[0]}.csv`
          : `groupby_result_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(a.href);
        document.body.removeChild(a);
        toast({ title: 'Export Successful', description: 'File downloaded successfully.' });
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Export failed');
      toast({ title: 'Export Failed', description: error || 'Export failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div key={refreshKey} className="w-full h-full p-6 bg-gradient-to-br from-slate-50 to-blue-50 overflow-y-auto">
      {!hasResults ? (
        <div className="bg-gray-50 p-8 rounded-lg text-center">
          <div className="text-gray-500 mb-4">
            <Download className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p className="text-lg font-medium text-gray-700 mb-2">No Results Available</p>
            <p className="text-sm text-gray-500">
              {hasAIResults 
                ? 'AI results are available but need to be processed. Check the main interface for results display.'
                : 'Perform a group-by operation first to export your results as CSV or Excel files.'
              }
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h5 className="text-md font-medium text-gray-900 mb-2">Export Options</h5>
            <p className="text-sm text-gray-600 mb-4">
              Download your group-by results in your preferred format.
            </p>
            <div className="space-y-3">
              <Button
                onClick={() => handleExport('csv')}
                className="w-full flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-700 text-white py-3"
                disabled={loading}
              >
                <FileText className="w-5 h-5" />
                <span>Export as CSV</span>
              </Button>
              <Button
                onClick={() => handleExport('excel')}
                className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white py-3"
                disabled={loading}
              >
                <FileSpreadsheet className="w-5 h-5" />
                <span>Export as Excel</span>
              </Button>
            </div>
            {error && <div className="text-red-600 mt-2">{error}</div>}
          </div>

          {resultShape && (
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-sm font-medium text-blue-900">Result Summary</span>
              </div>
              <p className="text-sm text-blue-700">
                Shape: {resultShape[0]} rows × {resultShape[1]} columns
              </p>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

export default GroupByExhibition;
